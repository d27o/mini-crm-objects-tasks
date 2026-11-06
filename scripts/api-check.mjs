// Проверка прав на живом проекте: прямые запросы к API в обход интерфейса.
// Запуск: npm run api-check (использует только anon-ключ и пароли тестовых пользователей из .env.seed).
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY, SEED_PASSWORD } = process.env
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
let failed = 0

async function login(email) {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts)
  const { data, error } = await c.auth.signInWithPassword({ email, password: SEED_PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  return { c, id: data.user.id }
}

function ok(label, cond, detail = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!cond) failed++
}

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts)
const boss = await login('manager@crm.test')
const ivan = await login('ivan@crm.test')

const all = (await boss.c.from('tasks').select('*')).data
const allSites = (await boss.c.from('sites').select('*')).data
const ivanTask = all.find((t) => t.assignee_id === ivan.id)
const olegTask = all.find((t) => t.assignee_id !== ivan.id)
const reviewTask = all.find((t) => t.assignee_id === ivan.id && t.status === 'review')

// Регистрация
const su = await anon.auth.signUp({ email: `hacker${Date.now()}@example.com`, password: 'Passw0rd!x' })
ok('регистрация закрыта', !!su.error, su.error?.message)

// Аноним
ok('аноним не видит задачи', ((await anon.from('tasks').select('*')).data ?? []).length === 0)

// Чтение исполнителем
const mine = (await ivan.c.from('tasks').select('*')).data
ok('Иван видит только свои задачи', mine.every((t) => t.assignee_id === ivan.id), `${mine.length} из ${all.length}`)
const mySites = (await ivan.c.from('sites').select('*')).data
ok('Иван видит только объекты со своими задачами', mySites.every((s) => mine.some((t) => t.site_id === s.id)), `${mySites.length} из ${allSites.length}`)
ok('Иван не видит чужую задачу по id', !(await ivan.c.from('tasks').select('*').eq('id', olegTask.id)).data.length)
ok('Иван не видит историю чужой задачи', !(await ivan.c.from('task_history').select('*').eq('task_id', olegTask.id)).data.length)

// Запись исполнителем
let r = await ivan.c.from('tasks').update({ status: 'accepted' }).eq('id', ivanTask.id)
ok('прямой UPDATE статуса запрещён', !!r.error, r.error?.message)
r = await ivan.c.from('tasks').update({ title: 'взлом' }).eq('id', ivanTask.id).select()
ok('Иван не может править задачу', !!r.error || r.data.length === 0, r.error?.message ?? '0 строк')
r = await ivan.c.from('tasks').insert({ title: 'x', site_id: ivanTask.site_id, assignee_id: ivan.id })
ok('Иван не может создать задачу', !!r.error, r.error?.message)
r = await ivan.c.from('sites').insert({ name: 'x' })
ok('Иван не может создать объект', !!r.error, r.error?.message)
r = await ivan.c.from('profiles').update({ role: 'manager' }).eq('id', ivan.id)
ok('Иван не может сделать себя постановщиком', !!r.error, r.error?.message)
r = await ivan.c.rpc('change_task_status', { p_task_id: olegTask.id, p_to: 'in_progress' })
ok('Иван не может двигать чужую задачу', !!r.error, r.error?.message)
if (reviewTask) {
  r = await ivan.c.rpc('change_task_status', { p_task_id: reviewTask.id, p_to: 'accepted' })
  ok('Иван не может принять свою задачу', !!r.error, r.error?.message)
}

// История
r = await ivan.c.from('task_history').insert({ task_id: ivanTask.id, changed_by: ivan.id, to_status: 'accepted' })
ok('нельзя добавить запись истории', !!r.error, r.error?.message)
r = await boss.c.from('task_history').update({ comment: 'подделка' }).eq('task_id', ivanTask.id)
ok('постановщик не может изменить историю', !!r.error, r.error?.message)
r = await boss.c.from('task_history').delete().eq('task_id', ivanTask.id)
ok('постановщик не может удалить историю', !!r.error, r.error?.message)

// Постановщик
const newTask = all.find((t) => t.status === 'new')
r = await boss.c.rpc('change_task_status', { p_task_id: newTask.id, p_to: 'accepted' })
ok('постановщик не может перепрыгнуть «Новая → Принята»', !!r.error, r.error?.message)
if (reviewTask) {
  r = await boss.c.rpc('change_task_status', { p_task_id: reviewTask.id, p_to: 'rework', p_comment: ' ' })
  ok('возврат без комментария запрещён', !!r.error, r.error?.message)
}

console.log(failed ? `\n${failed} проверок не прошли` : '\nВсе проверки прошли')
process.exit(failed ? 1 : 0)
