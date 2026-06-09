import { useState, useEffect } from 'react'
import { Shield, Users, Mail, Calendar, CheckCircle, XCircle, CreditCard, Loader, Search } from 'lucide-react'
import axios from 'axios'
import styles from './Admin.module.css'

export default function Admin() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ total: 0, actifs: 0, gratuits: 0, aucun: 0 })

  useEffect(() => {
    axios.get('/api/auth/admin/users')
      .then(r => {
        setUsers(r.data.users)
        const s = { total: r.data.users.length, actifs: 0, gratuits: 0, aucun: 0 }
        r.data.users.forEach(u => {
          if (u.abonnement === 'active') s.actifs++
          else if (u.abonnement === 'free') s.gratuits++
          else s.aucun++
        })
        setStats(s)
      })
      .catch(() => setError('Erreur chargement utilisateurs'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className={styles.page}>
      <Loader size={32} className={styles.spin} />
    </div>
  )

  const filtres = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const badge = (abo) => {
    if (abo === 'active') return <span className={styles.badgeActive}>Abonné</span>
    if (abo === 'free')   return <span className={styles.badgeFree}>Gratuit</span>
    return <span className={styles.badgeNone}>Aucun</span>
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <Shield size={24} className={styles.iconShield} />
          <div>
            <h1 className={styles.title}>Administration</h1>
            <p className={styles.subtitle}>Gestion des utilisateurs</p>
          </div>
        </div>
        <div className={styles.statsRow}>
          <div className={styles.stat}><Users size={16} /><span>{stats.total}</span> Total</div>
          <div className={styles.stat}><CreditCard size={16} /><span>{stats.actifs}</span> Abonnés</div>
          <div className={styles.stat}><CheckCircle size={16} /><span>{stats.gratuits}</span> Gratuits</div>
          <div className={styles.stat}><XCircle size={16} /><span>{stats.aucun}</span> Sans abo</div>
        </div>
      </div>

      <div className={styles.searchBox}>
        <Search size={16} />
        <input type="text" placeholder="Rechercher par nom ou email..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Vérifié</th>
              <th>Abonnement</th>
              <th>Expire le</th>
              <th>Paiements</th>
              <th>Inscrit le</th>
            </tr>
          </thead>
          <tbody>
            {filtres.map(u => (
              <tr key={u.id}>
                <td className={styles.cellId}>{u.id}</td>
                <td className={styles.cellName}>
                  {u.full_name}
                  {u.role === 'admin' && <span className={styles.adminTag}>Admin</span>}
                </td>
                <td className={styles.cellEmail}>{u.email}</td>
                <td>{u.verified ? <CheckCircle size={16} className={styles.iconOk} /> : <XCircle size={16} className={styles.iconNo} />}</td>
                <td>{badge(u.abonnement)}</td>
                <td className={styles.cellDate}>{u.abonnement_expire ? new Date(u.abonnement_expire).toLocaleDateString('fr-FR') : '—'}</td>
                <td className={styles.cellCenter}>{u.total_paiements}</td>
                <td className={styles.cellDate}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
