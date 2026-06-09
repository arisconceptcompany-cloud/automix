import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, UserPlus, LogOut, Mail, Lock, Loader, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../AuthContext'
import styles from './Auth.module.css'

export default function Auth() {
  const { login, register, user } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const basculer = () => {
    setMode(m => m === 'login' ? 'register' : 'login')
    setMessage(null); setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setMessage(null); setError(null)
    setLoading(true)
    try {
      if (mode === 'register') {
        if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); setLoading(false); return }
        const r = await register(fullName, email, password)
        if (!r.est_aris) {
          setMessage('Compte créé ! Après confirmation par email, connectez-vous et souscrivez à un abonnement pour accéder à l\'application.')
        } else {
          setMessage(r.message)
        }
      } else {
        const r = await login(email, password, remember)
        if (!r.user.acces) {
          navigate('/abonnement')
        } else {
          navigate('/explorateur')
        }
      }
    } catch (err) {
      setError(err.response?.data?.erreur || 'Une erreur est survenue')
    } finally { setLoading(false) }
  }

  if (user) {
    return (
      <div className={styles.page}>
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.appName}>Automix</span>
              <span className={styles.appSub}>Gestion de produits</span>
            </div>
            <CheckCircle size={48} className={styles.iconSuccess} />
            <p className={styles.userName}>{user.full_name}</p>
            <p className={styles.userEmail}>{user.email}</p>
            <button className={styles.btnPrimary} onClick={() => navigate('/explorateur')}>
              Accéder à l'application
            </button>
            <button className={styles.btnLogout} onClick={() => { logout(); navigate('/auth') }}>
              <LogOut size={16} /> Se déconnecter
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
            <span className={styles.appSub}>Gestion de produits</span>
          </div>

          <div className={styles.tabs}>
            <button className={`${styles.tab} ${mode === 'login' ? styles.tabActif : ''}`}
              onClick={() => setMode('login')}>
              <LogIn size={16} /> Connexion
            </button>
            <button className={`${styles.tab} ${mode === 'register' ? styles.tabActif : ''}`}
              onClick={() => setMode('register')}>
              <UserPlus size={16} /> Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {message && <div className={styles.success}><CheckCircle size={16}/> {message}</div>}
            {error && <div className={styles.error}><AlertCircle size={16}/> {error}</div>}

            {mode === 'register' && (
              <div className={styles.field}>
                <label>Nom complet</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Jean Dupont" required />
              </div>
            )}

            <div className={styles.field}>
              <label>Email</label>
              <div className={styles.inputWrap}>
                <Mail size={16} className={styles.inputIcon} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="prenom@aris-cc.com" required />
              </div>
            </div>

            <div className={styles.field}>
              <label>Mot de passe</label>
              <div className={styles.inputWrap}>
                <Lock size={16} className={styles.inputIcon} />
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 caractères" required minLength={6} />
                <button type="button" className={styles.pwdToggle}
                  onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className={styles.field}>
                <label>Confirmer le mot de passe</label>
                <div className={styles.inputWrap}>
                  <Lock size={16} className={styles.inputIcon} />
                  <input type={showPwd ? 'text' : 'password'} value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Répétez le mot de passe" required minLength={6} />
                </div>
              </div>
            )}

            {mode === 'login' && (
              <label className={styles.remember}>
                <input type="checkbox" checked={remember}
                  onChange={e => setRemember(e.target.checked)} />
                Se souvenir de moi
              </label>
            )}

            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? <><Loader size={16} className={styles.spin}/> Veuillez patienter...</>
                : mode === 'login' ? <><LogIn size={16}/> Se connecter</>
                : <><UserPlus size={16}/> Créer mon compte</>}
            </button>
          </form>

          <p className={styles.switch}>
            {mode === 'login' ? (
              <>Pas encore de compte ? <button onClick={basculer}>Créer un compte</button></>
            ) : (
              <>Déjà un compte ? <button onClick={basculer}>Se connecter</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
