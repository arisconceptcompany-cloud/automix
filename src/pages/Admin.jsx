import { useState, useEffect, useCallback } from 'react'
import { Shield, Users, CheckCircle, XCircle, CreditCard, Search, Clock, Loader, Trash2 } from 'lucide-react'
import axios from 'axios'
import ProgressBar from '../components/ProgressBar'
import styles from './Admin.module.css'

export default function Admin() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ total: 0, actifs: 0, gratuits: 0, aucun: 0, attente: 0 })
  const [actionEnCours, setActionEnCours] = useState(null)
  const [flash, setFlash] = useState(null)
  const [aSupprimer, setASupprimer] = useState(null)

  const chargerUtilisateurs = useCallback(() => {
    return axios.get('/api/auth/admin/users')
      .then(r => {
        setUsers(r.data.users)
        const s = { total: r.data.users.length, actifs: 0, gratuits: 0, aucun: 0, attente: 0 }
        r.data.users.forEach(u => {
          if (u.status === 'pending') s.attente++
          if (u.abonnement === 'active') s.actifs++
          else if (u.abonnement === 'free') s.gratuits++
          else s.aucun++
        })
        setStats(s)
      })
      .catch(() => { throw new Error('Erreur chargement utilisateurs') })
  }, [])

  useEffect(() => {
    chargerUtilisateurs()
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [chargerUtilisateurs])

  const traiter = async (id, action) => {
    setActionEnCours(`${action}-${id}`)
    setFlash(null)
    try {
      const r = await axios.post(`/api/auth/admin/${action}/${id}`)
      setFlash({ type: 'ok', texte: r.data.message || 'Action effectuée' })
      await chargerUtilisateurs()
    } catch (err) {
      setFlash({ type: 'ko', texte: err.response?.data?.erreur || 'Erreur lors de l\'action' })
    } finally {
      setActionEnCours(null)
    }
  }

  const confirmerSuppression = async () => {
    if (!aSupprimer) return
    setActionEnCours(`delete-${aSupprimer.id}`)
    setFlash(null)
    try {
      const r = await axios.delete(`/api/auth/admin/delete/${aSupprimer.id}`)
      setFlash({ type: 'ok', texte: r.data.message || 'Compte supprimé' })
      await chargerUtilisateurs()
    } catch (err) {
      setFlash({ type: 'ko', texte: err.response?.data?.erreur || 'Erreur lors de la suppression' })
    } finally {
      setActionEnCours(null)
      setASupprimer(null)
    }
  }

  if (loading) return (
    <div className={styles.page}>
      <ProgressBar />
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

  const statutBadge = (status) => {
    if (status === 'pending') return <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 10px', borderRadius:'999px', fontSize:'12px', fontWeight:600, background:'#fef3c7', color:'#92400e' }}><Clock size={12} /> En attente</span>
    if (status === 'refused') return <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 10px', borderRadius:'999px', fontSize:'12px', fontWeight:600, background:'#fee2e2', color:'#991b1b' }}><XCircle size={12} /> Refusé</span>
    return <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 10px', borderRadius:'999px', fontSize:'12px', fontWeight:600, background:'#dcfce7', color:'#166534' }}><CheckCircle size={12} /> Approuvé</span>
  }

  const btnAction = {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginRight: '6px',
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
          <div className={styles.stat} style={stats.attente > 0 ? { color:'#92400e', fontWeight:700 } : undefined}><Clock size={16} /><span>{stats.attente}</span> En attente</div>
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
      {flash && (
        <div style={{
          margin: '10px 0', padding: '10px 14px', borderRadius: '8px', fontSize: '14px',
          background: flash.type === 'ok' ? '#dcfce7' : '#fee2e2',
          color: flash.type === 'ok' ? '#166534' : '#991b1b',
        }}>
          {flash.texte}
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Statut</th>
              <th>Vérifié</th>
              <th>Abonnement</th>
              <th>Expire le</th>
              <th>Paiements</th>
              <th>Inscrit le</th>
              <th>Supprimer</th>
              {(stats.attente > 0) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtres.map(u => (
              <tr key={u.id}
                  style={u.status === 'pending' ? { background: '#fffbeb' } : undefined}>
                <td className={styles.cellId}>{u.id}</td>
                <td className={styles.cellName}>
                  {u.full_name}
                  {u.role === 'admin' && <span className={styles.adminTag}>Admin</span>}
                </td>
                <td className={styles.cellEmail}>{u.email}</td>
                <td>{statutBadge(u.status)}</td>
                <td>{u.verified ? <CheckCircle size={16} className={styles.iconOk} /> : <XCircle size={16} className={styles.iconNo} />}</td>
                <td>{badge(u.abonnement)}</td>
                <td className={styles.cellDate}>{u.abonnement_expire ? new Date(u.abonnement_expire).toLocaleDateString('fr-FR') : '—'}</td>
                <td className={styles.cellCenter}>{u.total_paiements}</td>
                <td className={styles.cellDate}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                <td className={styles.cellCenter}>
                  {u.role !== 'admin' && (
                    <button
                      title="Supprimer ce compte"
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid #dc2626',
                        background: 'transparent',
                        color: '#dc2626',
                        cursor: actionEnCours ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: actionEnCours ? 0.5 : 1,
                      }}
                      disabled={actionEnCours !== null}
                      onClick={() => setASupprimer({ id: u.id, nom: u.full_name, email: u.email })}>
                      <Trash2 size={12} /> Supprimer
                    </button>
                  )}
                </td>
                {(stats.attente > 0) && (
                  <td className={styles.cellCenter}>
                    {u.status === 'pending' && (
                      <>
                        <button
                          style={{ ...btnAction, background: '#16a34a', color: '#fff' }}
                          disabled={actionEnCours !== null}
                          onClick={() => traiter(u.id, 'approve')}>
                          {actionEnCours === `approve-${u.id}` ? <Loader size={12} /> : <CheckCircle size={12} />} Approuver
                        </button>
                        <button
                          style={{ ...btnAction, background: '#dc2626', color: '#fff' }}
                          disabled={actionEnCours !== null}
                          onClick={() => traiter(u.id, 'refuse')}>
                          {actionEnCours === `refuse-${u.id}` ? <Loader size={12} /> : <XCircle size={12} />} Refuser
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aSupprimer && (
        <div
          onClick={() => actionEnCours === null && setASupprimer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '28px',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              textAlign: 'center',
            }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: '#fee2e2', color: '#dc2626',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Trash2 size={26} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a' }}>
              Supprimer ce compte ?
            </h3>
            <p style={{ margin: '0 0 6px', fontSize: '14px', color: '#334155' }}>
              Vous êtes sur le point de supprimer définitivement le compte de :
            </p>
            <p style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              {aSupprimer.nom}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b' }}>
              {aSupprimer.email} — Cette action est <b>irréversible</b>. Les sessions et paiements associés seront également supprimés.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setASupprimer(null)}
                disabled={actionEnCours !== null}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                }}>
                Annuler
              </button>
              <button
                onClick={confirmerSuppression}
                disabled={actionEnCours !== null}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  opacity: actionEnCours ? 0.6 : 1,
                }}>
                {actionEnCours === `delete-${aSupprimer.id}` ? <><Loader size={14} /> Suppression...</> : <><Trash2 size={14} /> Oui, supprimer</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
