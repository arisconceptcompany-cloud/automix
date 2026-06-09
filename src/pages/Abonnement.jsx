import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, CheckCircle, AlertCircle, Loader, Zap, Smartphone, Banknote, Globe } from 'lucide-react'
import { useAuth } from '../AuthContext'
import axios from 'axios'
import styles from './Abonnement.module.css'

const methodes = [
  { id: 'mvola',  label: 'MVola',         icon: Smartphone, type: 'mobile' },
  { id: 'orange', label: 'Orange Money',  icon: Smartphone, type: 'mobile' },
  { id: 'airtel', label: 'Airtel Money',  icon: Smartphone, type: 'mobile' },
  { id: 'visa',   label: 'Carte Visa/Mastercard', icon: CreditCard, type: 'card' },
  { id: 'paypal', label: 'PayPal',        icon: Globe,      type: 'card' },
]

export default function Abonnement() {
  const { user, logout, setUser } = useAuth()
  const navigate = useNavigate()
  const [sub, setSub] = useState(null)
  const [mois, setMois] = useState(1)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [methode, setMethode] = useState('')
  const [telephone, setTelephone] = useState('')

  useEffect(() => {
    if (!user) { navigate('/auth'); return }
    axios.get('/api/auth/subscription')
      .then(r => setSub(r.data))
      .catch(() => setError('Erreur chargement abonnement'))
      .finally(() => setLoading(false))
  }, [user])

  if (!user) return null

  const prixUnitaire = sub?.prix || 10000
  const total = prixUnitaire * mois
  const estMobile = methodes.find(m => m.id === methode)?.type === 'mobile'

  const payer = async () => {
    if (!methode) { setError('Veuillez choisir un moyen de paiement'); return }
    setPaying(true); setError(null)
    try {
      const r = await axios.post('/api/auth/subscription/payer', { mois, methode, telephone })
      setDone(true)
      setSub(prev => ({ ...prev, abonnement: 'active', abonnement_expire: r.data.abonnement_expire, acces: true }))
      setUser(prev => prev ? { ...prev, acces: true, abonnement: 'active', abonnement_expire: r.data.abonnement_expire } : prev)
    } catch (err) {
      setError(err.response?.data?.erreur || 'Erreur de paiement')
    } finally { setPaying(false) }
  }

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.wrapper}>
        <Loader size={32} className={styles.spin} />
      </div>
    </div>
  )

  if (sub?.abonnement === 'free') {
    return (
      <div className={styles.page}>
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <Zap size={48} className={styles.iconFree} />
            <h2 className={styles.title}>Accès gratuit</h2>
            <p className={styles.desc}>
              Votre email <strong>{user.email}</strong> bénéficie de l'accès gratuit
              réservé aux collaborateurs ARIS.
            </p>
            <button className={styles.btnPrimary} onClick={() => navigate('/explorateur')}>
              Accéder à l'application
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (done || sub?.abonnement === 'active') {
    return (
      <div className={styles.page}>
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <CheckCircle size={48} className={styles.iconSuccess} />
            <h2 className={styles.title}>Abonnement actif</h2>
            <p className={styles.desc}>
              Accès valable jusqu'au{' '}
              <strong>{new Date(sub?.abonnement_expire).toLocaleDateString('fr-FR')}</strong>
            </p>
            <button className={styles.btnPrimary} onClick={() => navigate('/explorateur')}>
              Accéder à l'application
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.appName}>Automix</span>
            <span className={styles.appSub}>Abonnement requis</span>
          </div>

          <div className={styles.planBox}>
            <div className={styles.planPrice}>{prixUnitaire.toLocaleString('fr-FR')} MGA</div>
            <div className={styles.planPeriod}>/ mois</div>
            <ul className={styles.planFeatures}>
              <li>Accès complet à l'Explorateur</li>
              <li>Comparaison avec le fichier Excel</li>
              <li>Recherche de fiches PDF</li>
              <li>Mise à jour des prix</li>
              <li>Support prioritaire</li>
            </ul>
          </div>

          <div className={styles.infoBox}>
            <AlertCircle size={16} />
            <span>
              Vous utilisez <strong>{user.email}</strong>. Cet email n'est pas reconnu
              comme collaborateur ARIS. Un abonnement de <strong>{prixUnitaire.toLocaleString('fr-FR')} MGA/mois</strong> est requis.
            </span>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {/* Durée */}
          <div className={styles.moisSelector}>
            <label>Durée d'abonnement</label>
            <div className={styles.moisBtns}>
              {[1, 3, 6, 12].map(m => (
                <button key={m}
                  className={`${styles.moisBtn} ${mois === m ? styles.moisActif : ''}`}
                  onClick={() => setMois(m)}>
                  {m} {m > 1 ? 'mois' : 'mois'}
                  {m >= 6 && <small>économique</small>}
                </button>
              ))}
            </div>
          </div>

          {/* Moyen de paiement */}
          <div className={styles.methodeSection}>
            <label>Moyen de paiement</label>
            <div className={styles.methodeGrid}>
              {methodes.map(m => {
                const Icon = m.icon
                return (
                  <button key={m.id}
                    className={`${styles.methodeBtn} ${methode === m.id ? styles.methodeActif : ''}`}
                    onClick={() => { setMethode(m.id); setError(null) }}>
                    <Icon size={20} />
                    <span>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Téléphone pour Mobile Money */}
          {estMobile && (
            <div className={styles.phoneSection}>
              <label>Numéro de téléphone <small>(pour la confirmation)</small></label>
              <input type="tel" className={styles.phoneInput}
                placeholder="034 XX XXX XX"
                value={telephone} onChange={e => setTelephone(e.target.value)} />
            </div>
          )}

          <div className={styles.totalRow}>
            <span>Total</span>
            <span className={styles.totalPrice}>{total.toLocaleString('fr-FR')} MGA</span>
          </div>

          <button className={styles.btnPrimary} onClick={payer} disabled={paying || !methode}>
            {paying ? <><Loader size={16} className={styles.spin}/> Traitement...</>
              : <><Banknote size={16}/> Payer {total.toLocaleString('fr-FR')} MGA</>}
          </button>

          <button className={styles.btnLogout} onClick={() => { logout(); navigate('/auth') }}>
            Retour à la connexion
          </button>
        </div>
      </div>
    </div>
  )
}
