import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Shield, FileSpreadsheet, Compass, LogIn, LogOut, User, CreditCard, Zap, Clock, Globe, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '../AuthContext'
import axios from 'axios'
import styles from './Sidebar.module.css'

const nav = [
  { to: '/excel',       icon: FileSpreadsheet, label: 'Fichier Excel' },
  { to: '/explorateur', icon: Compass,         label: 'Explorateur'   },
]

export default function Sidebar({ onToggle }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [historique, setHistorique] = useState([])
  const [histOpen, setHistOpen] = useState(false)

  useEffect(() => {
    if (onToggle) onToggle(collapsed)
  }, [collapsed])

  const closeMobile = () => setMobileOpen(false)

  useEffect(() => {
    if (!user) return
    axios.get('/api/historique')
      .then(r => setHistorique(r.data || []))
      .catch(() => {})
  }, [user])

  const supprimer = async (url) => {
    try {
      const b64 = btoa(url)
      const r = await axios.delete(`/api/historique/${b64}`)
      setHistorique(r.data.historique || [])
    } catch {}
  }

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  } 

  return (
    <>
      <button className={styles.mobileToggle} onClick={() => setMobileOpen(v => !v)}>
        <Compass size={20} />
      </button>
      {mobileOpen && <div className={styles.overlay} onClick={closeMobile} />}
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}>
      <button className={styles.toggleBtn} onClick={() => setCollapsed(v => !v)}>
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <div className={styles.logo}>
        <Compass size={18} />
        {(!collapsed || mobileOpen) && <span>Automix</span>}
      </div>

      <nav className={styles.nav}>
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} title={collapsed ? label : undefined}
            className={({ isActive }) => styles.link + (isActive ? ' ' + styles.active : '')}
            onClick={closeMobile}>
            <Icon size={17} />
            {(!collapsed || mobileOpen) && <span>{label}</span>}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/admin" title={collapsed ? 'Admin' : undefined}
            className={({ isActive }) => styles.link + (isActive ? ' ' + styles.active : '')}
            onClick={closeMobile}>
            <Shield size={17} />
            {(!collapsed || mobileOpen) && <span>Admin</span>}
          </NavLink>
        )}
      </nav>

      {user && historique.length > 0 && (!collapsed || mobileOpen) && (
        <div className={styles.historySection}>
          <button className={styles.historyToggle} onClick={() => setHistOpen(v => !v)}>
            <Clock size={13} />
            <span>Historique ({historique.length})</span>
            {histOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {histOpen && (
            <div className={styles.historyList}>
              {historique.slice(0, 8).map((h, i) => (
                <div key={i} className={styles.historyItem}
                  title={`${h.titre || h.url}\n${h.date || ''}`}
                  onClick={() => navigate('/explorateur', { state: { url: h.url } })}>
                  <Globe size={11} className={styles.historyIcon} />
                  <span className={styles.historyTitle}>{h.titre || h.url}</span>
                  <button className={styles.historyDel}
                    onClick={e => { e.stopPropagation(); supprimer(h.url) }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              {historique.length > 8 && (
                <div className={styles.historyMore}>
                  +{historique.length - 8} autres
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={styles.auth}>
        {user ? (
          <>
            <div className={styles.userInfo} title={collapsed ? user.full_name : undefined}>
              <User size={15} />
              {(!collapsed || mobileOpen) && <span className={styles.userName}>{user.full_name}</span>}
              {user.abonnement === 'free' && <Zap size={12} className={styles.badgeFree} title="Accès gratuit" />}
              {user.abonnement === 'active' && <CreditCard size={12} className={styles.badgePay} title="Abonné" />}
            </div>
            {(!collapsed || mobileOpen) && user.abonnement !== 'free' && user.abonnement !== 'active' && (
              <NavLink to="/abonnement" className={styles.subLink}>
                <CreditCard size={14} /> Souscrire
              </NavLink>
            )}
            <button className={styles.authBtn} onClick={handleLogout} title="Se déconnecter">
              <LogOut size={15} />
              {(!collapsed || mobileOpen) && 'Déconnexion'}
            </button>
          </>
        ) : (
          <NavLink to="/auth" title={collapsed ? 'Connexion' : undefined}
            className={({ isActive }) => styles.link + (isActive ? ' ' + styles.active : '')}>
            <LogIn size={17} />
            {(!collapsed || mobileOpen) && <span>Connexion</span>}
          </NavLink>
        )}
      </div>
    </aside>
    </>
  )
}
