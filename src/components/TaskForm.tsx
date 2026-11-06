import { useState, type FormEvent } from 'react'
import type { Profile, Site } from '../lib/types'

export interface TaskFormValues {
  title: string
  description: string
  site_id: string
  assignee_id: string
}

interface Props {
  initial: TaskFormValues
  executors: Profile[]
  sites?: Site[] // если передан — объект можно сменить
  submitLabel: string
  onSubmit: (v: TaskFormValues) => Promise<string | null>
  onCancel?: () => void
}

export default function TaskForm({ initial, executors, sites, submitLabel, onSubmit, onCancel }: Props) {
  const [v, setV] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const err = await onSubmit(v)
    setBusy(false)
    setError(err)
    if (!err && !onCancel) setV({ ...initial })
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Название
        <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required />
      </label>
      <label>
        Описание
        <textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </label>
      {sites && (
        <label>
          Объект
          <select value={v.site_id} onChange={(e) => setV({ ...v, site_id: e.target.value })} required>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Исполнитель
        <select value={v.assignee_id} onChange={(e) => setV({ ...v, assignee_id: e.target.value })} required>
          <option value="" disabled>
            — выберите —
          </option>
          {executors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button disabled={busy}>{submitLabel}</button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  )
}
