import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMe } from '../auth'
import TaskForm from '../components/TaskForm'
import TaskTable from '../components/TaskTable'
import { errorText, supabase } from '../lib/supabase'
import type { Site, Task } from '../lib/types'
import { useProfiles } from '../lib/useProfiles'

export default function SiteDetail() {
  const { id } = useParams<{ id: string }>()
  const me = useMe()
  const navigate = useNavigate()
  const profiles = useProfiles()
  const [site, setSite] = useState<Site | null | undefined>(undefined)
  const [tasks, setTasks] = useState<Task[]>([])
  const [editing, setEditing] = useState(false)
  const [showNewTask, setShowNewTask] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.from('sites').select('*').eq('id', id!).maybeSingle(),
      supabase.from('tasks').select('*').eq('site_id', id!).order('created_at', { ascending: false }),
    ])
    setSite(s.data)
    setTasks(t.data ?? [])
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (site === undefined) return <p className="muted">Загрузка…</p>
  // Чужой объект для исполнителя выглядит так же, как несуществующий: RLS его просто не вернула.
  if (site === null) return <p>Объект не найден. <Link to="/sites">К списку объектов</Link></p>

  const isManager = me.role === 'manager'
  const executors = [...profiles.values()].filter((p) => p.role === 'executor')

  async function remove() {
    if (!confirm(`Удалить объект «${site!.name}»?`)) return
    const { error } = await supabase.from('sites').delete().eq('id', site!.id)
    if (error) {
      setError(error.code === '23503' ? 'Нельзя удалить объект, пока в нём есть задачи.' : errorText(error))
      return
    }
    navigate('/sites')
  }

  return (
    <>
      <p className="crumbs">
        <Link to="/sites">Объекты</Link> /
      </p>
      {editing ? (
        <SiteEditForm site={site} onDone={() => { setEditing(false); load() }} />
      ) : (
        <div className="title-row">
          <div>
            <h1>{site.name}</h1>
            <p className="muted">{site.address || 'Адрес не указан'}</p>
          </div>
          {isManager && (
            <div className="row">
              <button className="secondary" onClick={() => setEditing(true)}>Изменить</button>
              <button className="danger" onClick={remove}>Удалить</button>
            </div>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="title-row">
        <h2>{isManager ? 'Задачи' : 'Мои задачи на объекте'}</h2>
        {isManager && !showNewTask && <button onClick={() => setShowNewTask(true)}>Новая задача</button>}
      </div>
      {showNewTask && (
        <TaskForm
          initial={{ title: '', description: '', site_id: site.id, assignee_id: '' }}
          executors={executors}
          submitLabel="Создать задачу"
          onCancel={() => setShowNewTask(false)}
          onSubmit={async (v) => {
            const { error } = await supabase.from('tasks').insert(v)
            if (error) return errorText(error)
            setShowNewTask(false)
            load()
            return null
          }}
        />
      )}
      <TaskTable tasks={tasks} profiles={profiles} />
    </>
  )
}

function SiteEditForm({ site, onDone }: { site: Site; onDone: () => void }) {
  const [name, setName] = useState(site.name)
  const [address, setAddress] = useState(site.address)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('sites').update({ name, address }).eq('id', site.id)
    if (error) return setError(errorText(error))
    onDone()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Название
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Адрес
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button>Сохранить</button>
        <button type="button" className="secondary" onClick={onDone}>Отмена</button>
      </div>
    </form>
  )
}
