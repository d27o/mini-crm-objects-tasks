import { NavLink, Outlet } from 'react-router-dom'
import { useMe } from '../auth'
import { supabase } from '../lib/supabase'

const ROLE_LABEL = { manager: 'Постановщик', executor: 'Исполнитель' } as const

export default function Layout() {
  const me = useMe()
  return (
    <>
      <header className="header">
        <nav>
          {me.role === 'executor' && <NavLink to="/my">Мои задачи</NavLink>}
          <NavLink to="/sites">Объекты</NavLink>
        </nav>
        <div className="user">
          <span>
            {me.full_name || me.email} <span className="muted">· {ROLE_LABEL[me.role]}</span>
          </span>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            Выйти
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </>
  )
}
