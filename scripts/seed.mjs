// Заполняет проект тестовыми пользователями и данными.
// Запускается локально: npm run seed (ключи берутся из .env.seed, см. .env.seed.example).
// service_role нужен только чтобы создать пользователей (регистрация закрыта) и назначить роль.
// Объекты, задачи и смены статусов делаются от имени самих пользователей — через те же правила, что и в приложении.
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SEED_PASSWORD } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !SEED_PASSWORD) {
  console.error('Заполните .env.seed (см. .env.seed.example)')
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts)

const USERS = [
  { key: 'boss', email: 'manager@crm.test', full_name: 'Анна Руководитель', role: 'manager' },
  { key: 'ivan', email: 'ivan@crm.test', full_name: 'Иван Петров', role: 'executor' },
  { key: 'oleg', email: 'oleg@crm.test', full_name: 'Олег Смирнов', role: 'executor' },
]

function check({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

async function ensureUser(u) {
  const list = check(await admin.auth.admin.listUsers({ perPage: 1000 }), 'listUsers')
  let user = list.users.find((x) => x.email === u.email)
  if (!user) {
    user = check(
      await admin.auth.admin.createUser({
        email: u.email,
        password: SEED_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      }),
      `createUser ${u.email}`,
    ).user
  }
  check(await admin.from('profiles').update({ role: u.role, full_name: u.full_name }).eq('id', user.id), 'profile')
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts)
  check(await client.auth.signInWithPassword({ email: u.email, password: SEED_PASSWORD }), `login ${u.email}`)
  return { id: user.id, client }
}

const users = {}
for (const u of USERS) users[u.key] = await ensureUser(u)
console.log('Пользователи готовы:', USERS.map((u) => u.email).join(', '))

const { boss, ivan, oleg } = users
const existing = check(await boss.client.from('sites').select('id', { count: 'exact', head: false }), 'sites')
if (existing.length > 0) {
  console.log('Объекты уже есть — данные не добавляю.')
  process.exit(0)
}

const sites = check(
  await boss.client
    .from('sites')
    .insert([
      { name: 'ЖК «Северный парк»', address: 'г. Москва, ул. Лесная, 12' },
      { name: 'Склад «Восток-2»', address: 'Московская обл., Балашиха, ш. Энтузиастов, 45' },
      { name: 'Офис на Профсоюзной', address: 'г. Москва, ул. Профсоюзная, 88, 3 этаж' },
    ])
    .select(),
  'insert sites',
)
const [park, sklad, office] = sites

// [название, описание, объект, исполнитель, цепочка статусов: [кто, куда, комментарий]]
const TASKS = [
  ['Залить фундамент секции 1', 'Бетон М300, уход за бетоном 7 дней.', park, ivan,
    [[ivan, 'in_progress'], [ivan, 'review'], [boss, 'accepted']]],
  ['Монтаж опалубки секции 2', 'По проекту КЖ-2, лист 4.', park, ivan,
    [[ivan, 'in_progress'], [ivan, 'review']]],
  ['Гидроизоляция подвала', 'Обмазочная, 2 слоя.', park, oleg,
    [[oleg, 'in_progress'], [oleg, 'review'], [boss, 'rework', 'Второй слой нанесён не по всей площади, доделать угол у оси А-1.']]],
  ['Разметка под стеллажи', 'Схема расстановки во вложении у прораба.', sklad, oleg,
    [[oleg, 'in_progress']]],
  ['Проверить ворота №3', 'Не закрываются до конца, заедает привод.', sklad, ivan, []],
  ['Демонтаж перегородок', 'Кабинеты 301–305, вывоз мусора.', office, oleg, []],
  ['Прокладка слаботочки', 'Кабель UTP cat.6, 24 точки.', office, ivan,
    [[ivan, 'in_progress'], [ivan, 'review'], [boss, 'rework', 'Нет маркировки на патч-панели.'], [ivan, 'in_progress']]],
]

for (const [title, description, site, assignee, chain] of TASKS) {
  const task = check(
    await boss.client.from('tasks').insert({ title, description, site_id: site.id, assignee_id: assignee.id }).select().single(),
    `insert task ${title}`,
  )
  for (const [who, to, comment] of chain) {
    check(
      await who.client.rpc('change_task_status', { p_task_id: task.id, p_to: to, p_comment: comment ?? null }),
      `${title}: → ${to}`,
    )
  }
}
console.log(`Готово: ${sites.length} объекта, ${TASKS.length} задач.`)
