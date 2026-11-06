import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth'
import { errorText, supabase } from '../lib/supabase'
import type { Site } from '../lib/types'

export default function Sites() {
  const me = useMe()
  const [sites, setSites] = useState<Site[] | null>(null)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)

  async function load() {
    // RLS сама отдаёт исполнителю только «его» объекты и задачи.
    const [s, t] = await Promise.all([
      supabase.from('sites').select('*').order('name'),
      supabase.from('tasks').select('site_id'),
    ])
    if (s.error) return setError(errorText(s.error))
    setSites(s.data)
    const c = new Map<string, number>()
    for (const row of t.data ?? []) c.set(row.site_id, (c.get(row.site_id) ?? 0) + 1)
    setCounts(c)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <>
      <h1>Объекты</h1>
      {me.role === 'manager' && <NewSiteForm onCreated={load} />}
      {error && <p className="error">{error}</p>}
      {sites === null ? (
        <p className="muted">Загрузка…</p>
      ) : sites.length === 0 ? (
        <p className="muted">Объектов пока нет.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Адрес</th>
              <th>{me.role === 'manager' ? 'Задач' : 'Моих задач'}</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/sites/${s.id}`}>{s.name}</Link>
                </td>
                <td>{s.address}</td>
                <td>{counts.get(s.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function NewSiteForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('sites').insert({ name, address })
    if (error) return setError(errorText(error))
    setName('')
    setAddress('')
    setError(null)
    onCreated()
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <input placeholder="Название объекта" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} />
      <button>Добавить объект</button>
      {error && <span className="error">{error}</span>}
    </form>
  )
}
