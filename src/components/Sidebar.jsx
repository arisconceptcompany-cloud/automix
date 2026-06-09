import { NavLink, useNavigate } from 'react-router-dom'
import { Shield, FileSpreadsheet, Compass, LogIn, LogOut, User, CreditCard, Zap } from 'lucide-react'
import { useAuth } from '../AuthContext'
import styles from './Sidebar.module.css'

const nav = [
  { to: '/excel',       icon: FileSpreadsheet, label: 'Fichier Excel' },
  { to: '/explorateur', icon: Compass,         label: 'Explorateur'   },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span></span>
        <span>Automix</span>
      </div>
      <nav className={styles.nav}>
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => styles.link + (isActive ? ' ' + styles.active : '')}>
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/admin"
            className={({ isActive }) => styles.link + (isActive ? ' ' + styles.active : '')}>
            <Shield size={17} />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>
      <div className={styles.auth}>
        {user ? (
          <>
            <div className={styles.userInfo}>
              <User size={15} />
              <span className={styles.userName}>{user.full_name}</span>
              {user.abonnement === 'free' && <Zap size={12} className={styles.badgeFree} title="Accès gratuit" />}
              {user.abonnement === 'active' && <CreditCard size={12} className={styles.badgePay} title="Abonné" />}
            </div>
            {user.abonnement !== 'free' && user.abonnement !== 'active' && (
              <NavLink to="/abonnement" className={styles.subLink}>
                <CreditCard size={14} /> Souscrire
              </NavLink>
            )}
            <button className={styles.authBtn} onClick={handleLogout} title="Se déconnecter">
              <LogOut size={15} /> Déconnexion
            </button>
          </>
        ) : (
          <NavLink to="/auth" className={({ isActive }) => styles.link + (isActive ? ' ' + styles.active : '')}>
            <LogIn size={17} />
            <span>Connexion</span>
          </NavLink>
        )}
      </div>
      <div className={styles.footer}>v1.0</div>
    </aside>
  )
}
