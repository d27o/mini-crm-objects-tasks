import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMe } from '../auth'
import StatusBadge from '../components/StatusBadge'
import TaskForm from '../components/TaskForm'
import { profileName } from '../components/TaskTable'
import { errorText, supabase } from '../lib/supabase'
import { availableActions, formatDate, STATUS_LABEL, type StatusAction } from '../lib/status'
import type { HistoryEntry, Site, Task } from '../lib/types'
import { useProfiles } from '../lib/useProfiles'

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const me = useMe()
  const navigate = useNavigate()
  const profiles = useProfiles()
  const [task, setTask] = useState<Task | null | undefined>(undefined)
  const [site, setSite] = useState<Site | null>(null)
  const [sites, setSites] = useState<Site[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<StatusAction | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: t } = await supabase.from('tasks').select('*').eq('id', id!).maybeSingle()
    setTask(t)
    if (!t) return
    const [s, h, all] = await Promise.all([
      supabase.from('sites').select('*').eq('id', t.site_id).maybeSingle(),
      supabase.from('task_history').select('*').eq('task_id', t.id).order('created_at').order('id'),
      supabase.from('sites').select('*').order('name'),
    ])
    setSite(s.data)
    setHistory(h.data ?? [])
    setSites(all.data ?? [])
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (task === undefined) return <p className="muted">Загрузка…</p>
  if (task === null) return <p>Задача не найдена. <Link to="/">На главную</Link></p>

  const isManager = me.role === 'manager'
  const actions = availableActions(task, me)
  const executors = [...profiles.values()].filter((p) => p.role === 'executor')

  async function changeStatus(action: StatusAction) {
    if (action.needsComment && !comment.trim()) {
      setError('Напишите, что нужно доработать')
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('change_task_status', {
      p_task_id: task!.id,
      p_to: action.to,
      p_comment: comment.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errorText(error))
    setPending(null)
    setComment('')
    setError(null)
    load()
  }

  async function remove() {
    if (!confirm(`Удалить задачу «${task!.title}» вместе с историей?`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', task!.id)
    if (error) return setError(errorText(error))
    navigate(`/sites/${task!.site_id}`)
  }

  return (
    <>
      <p className="crumbs">
        <Link to="/sites">Объекты</Link> / {site && <Link to={`/sites/${site.id}`}>{site.name}</Link>} /
      </p>

      {editing ? (
        <TaskForm
          initial={{ title: task.title, description: task.description, site_id: task.site_id, assignee_id: task.assignee_id }}
          executors={executors}
          sites={sites}
          submitLabel="Сохранить"
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            const { error } = await supabase.from('tasks').update(v).eq('id', task.id)
            if (error) return errorText(error)
            setEditing(false)
            load()
            return null
          }}
        />
      ) : (
        <>
          <div className="title-row">
            <h1>{task.title}</h1>
            {isManager && (
              <div className="row">
                <button className="secondary" onClick={() => setEditing(true)}>Изменить</button>
                <button className="danger" onClick={remove}>Удалить</button>
              </div>
            )}
          </div>
          <dl className="fields">
            <dt>Статус</dt>
            <dd><StatusBadge status={task.status} /></dd>
            <dt>Объект</dt>
            <dd>{site ? <Link to={`/sites/${site.id}`}>{site.name}</Link> : '—'}</dd>
            <dt>Исполнитель</dt>
            <dd>{profileName(profiles.get(task.assignee_id))}</dd>
            <dt>Автор</dt>
            <dd>{profileName(profiles.get(task.author_id))}</dd>
            <dt>Создана</dt>
            <dd>{formatDate(task.created_at)}</dd>
            <dt>Описание</dt>
            <dd className="pre">{task.description || <span className="muted">—</span>}</dd>
          </dl>
        </>
      )}

      {actions.length > 0 && (
        <div className="card actions">
          {pending ? (
            <>
              <label>
                Что нужно доработать
                <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
              </label>
              <div className="row">
                <button disabled={busy} onClick={() => changeStatus(pending)}>{pending.label}</button>
                <button className="secondary" onClick={() => { setPending(null); setError(null) }}>Отмена</button>
              </div>
            </>
          ) : (
            <div className="row">
              {actions.map((a) => (
                <button
                  key={a.to}
                  disabled={busy}
                  className={a.to === 'rework' ? 'secondary' : undefined}
                  onClick={() => (a.needsComment ? setPending(a) : changeStatus(a))}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <h2>История</h2>
      <ul className="history">
        {history.map((h) => (
          <li key={h.id}>
            <span className="muted">{formatDate(h.created_at)}</span>{' '}
            <b>{profileName(profiles.get(h.changed_by))}</b>{' '}
            {h.from_status === null ? (
              <>создал(а) задачу</>
            ) : (
              <>
                {STATUS_LABEL[h.from_status]} → <b>{STATUS_LABEL[h.to_status]}</b>
              </>
            )}
            {h.comment && <div className="comment">{h.comment}</div>}
          </li>
        ))}
      </ul>
    </>
  )
}
