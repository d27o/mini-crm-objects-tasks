import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Sites from './pages/Sites'
import SiteDetail from './pages/SiteDetail'
import TaskDetail from './pages/TaskDetail'
import MyTasks from './pages/MyTasks'

export default function App() {
  const { loading, session, profile } = useAuth()

  if (loading) return <div className="center muted">Загрузка…</div>
  if (!session) return <Login />
  if (!profile) {
    return <div className="center error">Профиль пользователя не найден. Обратитесь к администратору.</div>
  }

  const home = profile.role === 'executor' ? '/my' : '/sites'
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/sites" element={<Sites />} />
        <Route path="/sites/:id" element={<SiteDetail />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/my" element={<MyTasks />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}
