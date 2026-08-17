import { useState, useRef } from 'react'
import { Search, Loader, Globe, Plus, Eye, EyeOff, X } from 'lucide-react'
import axios from 'axios'
import styles from './Visiteur.module.css'

const CATEGORIES_DEFAUT = [
  { label: 'Électroménager pose libre',  actif: true },
  { label: 'Électroménager encastrable', actif: true },
]
const MARQUES_DEFAUT = [
  { label: 'ASKO', actif: true },
  { label: 'BEKO', actif: true },
]

export default function Visiteur() {
  const [url,        setUrl]        = useState('')
  const [categories, setCategories] = useState(CATEGORIES_DEFAUT)
  const [marques,    setMarques]    = useState(MARQUES_DEFAUT)
  const [nouvCat,    setNouvCat]    = useState('')
  const [nouvMarque, setNouvMarque] = useState('')

  const [loginActif,      setLoginActif]      = useState(false)
  const [loginUrl,        setLoginUrl]        = useState('')
  const [loginEmail,      setLoginEmail]      = useState('')
  const [loginCodeClient, setLoginCodeClient] = useState('')
  const [loginPassword,   setLoginPassword]   = useState('')
  const [showPassword,    setShowPassword]    = useState(false)

  const [resultats, setResultats] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [erreur,    setErreur]    = useState(null)
  const resultsRef = useRef()

  const toggleCat     = (i) => setCategories(c => c.map((v,j) => j===i ? {...v, actif: !v.actif} : v))
  const toggleMarque  = (i) => setMarques(m => m.map((v,j) => j===i ? {...v, actif: !v.actif} : v))
  const ajouterCat    = () => { if (nouvCat.trim())    { setCategories(c => [...c, { label: nouvCat.trim(),    actif: true }]); setNouvCat('')    } }
  const ajouterMarque = () => { if (nouvMarque.trim()) { setMarques(m    => [...m, { label: nouvMarque.trim(), actif: true }]); setNouvMarque('') } }
  const supprimerCat    = (i) => setCategories(c => c.filter((_,j) => j !== i))
  const supprimerMarque = (i) => setMarques(m => m.filter((_,j) => j !== i))

  const lancer = async () => {
    if (!url.trim().startsWith('http')) { setErreur('URL invalide'); return }
    const catsActives    = categories.filter(c => c.actif).map(c => c.label)
    const marquesActives = marques.filter(m => m.actif).map(m => m.label)
    if (!catsActives.length || !marquesActives.length) { setErreur('Sélectionnez au moins une catégorie et une marque'); return }
    if (loginActif && (!loginEmail || !loginPassword)) { setErreur('Email et mot de passe requis'); return }

    setErreur(null); setLoading(true); setResultats([])
    try {
      const res = await axios.post('/api/visiteur/navigation', {
        url: url.trim(), categories: catsActives, marques: marquesActives,
        login_url: loginActif ? loginUrl : '',
        login_email: loginActif ? loginEmail : '',
        login_password: loginActif ? loginPassword : '',
        login_code_client: loginActif ? loginCodeClient.trim() || '' : '',
      })
      setResultats(res.data.resultats || [])
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 200)
    } catch (e) {
      setErreur(e.response?.data?.erreur || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const total = resultats.reduce((s, r) => s + (r.produits?.length || 0), 0)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Visiteur automatique</h1>
        <p>Le programme navigue dans les catégories et filtre par marque automatiquement</p>
      </div>

      {erreur && (
        <div className={styles.erreur}>
          {erreur}
          <button onClick={() => setErreur(null)}><X size={14}/></button>
        </div>
      )}

      <div className={styles.form}>

        {/* URL */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>URL du site</label>
          <div className={styles.urlRow}>
            <Globe size={15} className={styles.urlIcon} />
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://www.monsite.com" onKeyDown={e => e.key === 'Enter' && lancer()} />
          </div>
        </div>

        {/* Connexion */}
        <div className={styles.section}>
          <div className={styles.sectionLabelRow}>
            <label className={styles.sectionLabel}>Connexion au site</label>
            <span className={styles.optional}>optionnel</span>
            <div className={styles.toggle + (loginActif ? ' ' + styles.toggleOn : '')}
                 onClick={() => setLoginActif(v => !v)}>
              <div className={styles.toggleThumb} />
            </div>
          </div>
          {loginActif && (
            <div className={styles.loginGrid}>
              <input type="url" value={loginUrl} onChange={e => setLoginUrl(e.target.value)}
                placeholder="URL de connexion (optionnel)" className={styles.fullCol} />
              <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                placeholder="Email / identifiant *" />
              <input type="text" value={loginCodeClient} onChange={e => setLoginCodeClient(e.target.value)}
                placeholder="N° compte client (si requis)" />
              <div className={styles.passwordWrap}>
                <input type={showPassword ? 'text' : 'password'} value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)} placeholder="Mot de passe *" />
                <button type="button" onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Catégories + Marques côte à côte */}
        <div className={styles.twoCol}>
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Catégories</label>
            <div className={styles.tags}>
              {categories.map((c, i) => (
                <div key={i} className={styles.tag + (c.actif ? ' ' + styles.tagOn : '')}>
                  <button onClick={() => toggleCat(i)}>{c.actif ? '✓' : '○'}</button>
                  <span>{c.label}</span>
                  <button onClick={() => supprimerCat(i)}><X size={11}/></button>
                </div>
              ))}
            </div>
            <div className={styles.addRow}>
              <input value={nouvCat} onChange={e => setNouvCat(e.target.value)}
                placeholder="Ajouter..." onKeyDown={e => e.key === 'Enter' && ajouterCat()} />
              <button className={styles.addBtn} onClick={ajouterCat}><Plus size={13}/></button>
            </div>
          </div>

          <div className={styles.section}>
            <label className={styles.sectionLabel}>Marques</label>
            <div className={styles.tags}>
              {marques.map((m, i) => (
                <div key={i} className={styles.tag + (m.actif ? ' ' + styles.tagOn : '')}>
                  <button onClick={() => toggleMarque(i)}>{m.actif ? '✓' : '○'}</button>
                  <span>{m.label}</span>
                  <button onClick={() => supprimerMarque(i)}><X size={11}/></button>
                </div>
              ))}
            </div>
            <div className={styles.addRow}>
              <input value={nouvMarque} onChange={e => setNouvMarque(e.target.value)}
                placeholder="Ajouter..." onKeyDown={e => e.key === 'Enter' && ajouterMarque()} />
              <button className={styles.addBtn} onClick={ajouterMarque}><Plus size={13}/></button>
            </div>
          </div>
        </div>

        {/* Bouton lancer */}
        <button className={styles.btnLancer} onClick={lancer} disabled={loading}>
          {loading
            ? <><Loader size={16} className={styles.spin}/> Recherche en cours...</>
            : <><Search size={16}/> Lancer la recherche</>
          }
        </button>
      </div>

      {/* Résultats */}
      {resultats.length > 0 && (
        <div ref={resultsRef} className={styles.resultats}>
          <div className={styles.resumeBar}>
            {total} produit(s) trouvé(s) sur {resultats.length} combinaison(s)
          </div>
          {resultats.map((r, ri) => (
            <div key={ri} className={styles.resultBlock}>
              <div className={styles.resultHeader}>
                <span className={styles.catLabel}>{r.categorie}</span>
                <span className={styles.arrow}>›</span>
                <span className={styles.marqueLabel}>{r.marque}</span>
                <span className={styles.countLabel}>{r.produits?.length ?? 0} produit(s)</span>
              </div>
              {!r.produits?.length ? (
                <div className={styles.vide}>Aucun produit trouvé</div>
              ) : (
                <table className={styles.table}>
                  <thead><tr><th>#</th><th>Référence</th><th>Nom</th><th>Prix</th></tr></thead>
                  <tbody>
                    {r.produits.map((p, pi) => (
                      <tr key={pi}>
                        <td className={styles.num}>{pi+1}</td>
                        <td><code className={styles.ref}>{p.reference || '—'}</code></td>
                        <td>{p.nom || '—'}</td>
                        <td className={styles.prix}>{p.prix ? parseFloat(p.prix).toFixed(2)+' €' : p.prix_brut || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
