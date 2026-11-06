import type { Profile, Task, TaskStatus } from './types'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  rework: 'На доработке',
  accepted: 'Принята',
}

export interface StatusAction {
  to: TaskStatus
  label: string
  needsComment: boolean
}

// Копия правил из change_task_status() — только чтобы не показывать лишние кнопки.
// Настоящая проверка в базе: если здесь ошибиться, база всё равно откажет.
export function availableActions(task: Task, me: Profile): StatusAction[] {
  const isAssignee = task.assignee_id === me.id
  const isManager = me.role === 'manager'
  switch (task.status) {
    case 'new':
      return isAssignee ? [{ to: 'in_progress', label: 'Взять в работу', needsComment: false }] : []
    case 'in_progress':
      return isAssignee ? [{ to: 'review', label: 'Отправить на проверку', needsComment: false }] : []
    case 'rework':
      return isAssignee ? [{ to: 'in_progress', label: 'Вернуться к работе', needsComment: false }] : []
    case 'review':
      return isManager
        ? [
            { to: 'accepted', label: 'Принять', needsComment: false },
            { to: 'rework', label: 'Вернуть на доработку', needsComment: true },
          ]
        : []
    case 'accepted':
      return []
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}
