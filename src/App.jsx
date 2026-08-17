import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Sidebar     from './components/Sidebar'
import ProgressBar from './components/ProgressBar'
import Excel       from './pages/Excel'
import Explorateur from './pages/Explorateur'
import PDFs        from './pages/PDFs'
import Auth        from './pages/Auth'
import Abonnement  from './pages/Abonnement'
import Admin       from './pages/Admin'
import styles      from './App.module.css'

function LoaderScreen() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <ProgressBar />
    </div>
  )
}

function AcceesProtect({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <LoaderScreen />
  if (!user) return <Navigate to="/auth" replace />
  if (!user.acces) return <Navigate to="/abonnement" replace />
  return children
}

function AdminProtect({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <LoaderScreen />
  if (!user) return <Navigate to="/auth" replace />
  if (user.role !== 'admin') return <Navigate to="/explorateur" replace />
  return children
}

function AppLayout() {
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isAuth = location.pathname.startsWith('/auth')
  const isSub = location.pathname === '/abonnement'
  const noSidebar = isAuth || isSub

  return (
    <div className={noSidebar ? styles.authLayout : styles.layout}>
      {!noSidebar && <Sidebar onToggle={setSidebarCollapsed} />}
      <main className={noSidebar ? styles.authMain : `${styles.main} ${sidebarCollapsed ? styles.mainCollapsed : ''}`}>
        <Routes>
          <Route path="/"            element={<Navigate to="/explorateur" replace />} />
          <Route path="/auth"        element={<Auth />} />
          <Route path="/auth/verify/:token" element={<VerifyPage />} />
          <Route path="/abonnement"  element={<Abonnement />} />
          <Route path="/admin"       element={<AdminProtect><Admin /></AdminProtect>} />
          <Route path="/excel"       element={<AcceesProtect><Excel /></AcceesProtect>} />
          <Route path="/explorateur" element={<AcceesProtect><Explorateur /></AcceesProtect>} />
          <Route path="/pdfs"        element={<AcceesProtect><PDFs /></AcceesProtect>} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  )
}

function VerifyPage() {
  const token = window.location.pathname.replace('/auth/verify/', '')
  const [status, setStatus] = useState('verifying')

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    fetch(`/api/auth/verify/${token}`)
      .then(r => r.text())
      .then(() => setStatus('done'))
      .catch(() => setStatus('error'))
  }, [token])

  if (status === 'verifying') return <div style={{padding:'4rem',textAlign:'center'}}><ProgressBar text="Vérification en cours..." /></div>
  if (status === 'done') return <Navigate to="/auth" replace />
  return <div style={{padding:'4rem',textAlign:'center',color:'var(--danger)'}}>Lien invalide ou expiré</div>
}
