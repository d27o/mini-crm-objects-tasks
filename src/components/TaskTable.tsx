import { Link } from 'react-router-dom'
import { formatDate } from '../lib/status'
import type { Profile, Site, Task } from '../lib/types'
import StatusBadge from './StatusBadge'

interface Props {
  tasks: Task[]
  profiles: Map<string, Profile>
  sites?: Map<string, Site>
}

export default function TaskTable({ tasks, profiles, sites }: Props) {
  if (tasks.length === 0) return <p className="muted">Задач нет.</p>
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Задача</th>
          {sites && <th>Объект</th>}
          <th>Исполнитель</th>
          <th>Статус</th>
          <th>Создана</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id}>
            <td>
              <Link to={`/tasks/${t.id}`}>{t.title}</Link>
            </td>
            {sites && <td>{sites.get(t.site_id)?.name ?? '—'}</td>}
            <td>{profileName(profiles.get(t.assignee_id))}</td>
            <td>
              <StatusBadge status={t.status} />
            </td>
            <td className="muted">{formatDate(t.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function profileName(p: Profile | undefined): string {
  return p ? p.full_name || p.email : '—'
}
