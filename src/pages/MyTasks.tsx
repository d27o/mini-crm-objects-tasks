import { useEffect, useState } from 'react'
import { useMe } from '../auth'
import TaskTable from '../components/TaskTable'
import { errorText, supabase } from '../lib/supabase'
import { STATUS_LABEL } from '../lib/status'
import type { Site, Task, TaskStatus } from '../lib/types'
import { useProfiles } from '../lib/useProfiles'

// Сначала то, что требует действия исполнителя.
const ORDER: TaskStatus[] = ['rework', 'new', 'in_progress', 'review', 'accepted']

export default function MyTasks() {
  const me = useMe()
  const profiles = useProfiles()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [sites, setSites] = useState<Map<string, Site>>(new Map())
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      // Фильтр по исполнителю здесь для наглядности: постановщику RLS отдала бы все задачи.
      supabase.from('tasks').select('*').eq('assignee_id', me.id).order('created_at', { ascending: false }),
      supabase.from('sites').select('*'),
    ]).then(([t, s]) => {
      if (t.error) return setError(errorText(t.error))
      setTasks([...t.data].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)))
      setSites(new Map((s.data ?? []).map((x: Site) => [x.id, x])))
    })
  }, [me.id])

  const shown = tasks?.filter((t) => filter === 'all' || t.status === filter) ?? []

  return (
    <>
      <h1>Мои задачи</h1>
      <div className="filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value as TaskStatus | 'all')}>
          <option value="all">Все статусы</option>
          {ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {tasks === null ? <p className="muted">Загрузка…</p> : <TaskTable tasks={shown} profiles={profiles} sites={sites} />}
    </>
  )
}
