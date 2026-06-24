import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Globe, Search, Loader, ExternalLink, ChevronLeft, ChevronRight,
  Package, RefreshCw, Lock, Eye, EyeOff, LogIn, X, PlusCircle, Copy, CheckCircle,
  CheckSquare, Square
} from 'lucide-react'
import axios from 'axios'
import { getCache, setCache, clearCache } from '../cache'
import ProgressBar from '../components/ProgressBar'
import styles from './Explorateur.module.css'

function CaptchaModal({ siteKey, onSolve, onClose, loading }) {
  const containerRef = useRef(null)
  const cbNameRef = useRef('')

  useEffect(() => {
    if (!siteKey || !containerRef.current) return
    const div = containerRef.current
    cbNameRef.current = 'captchaResolue_' + Math.random().toString(36).slice(2)

    window[cbNameRef.current] = (token) => {
      onSolve(token)
    }

    div.innerHTML = `<div class="g-recaptcha" data-sitekey="${siteKey}" data-callback="${cbNameRef.current}" data-size="normal"></div>`

    if (!document.querySelector('script[src*="recaptcha/api.js"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.google.com/recaptcha/api.js'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    } else {
      window.grecaptcha?.render()
    }

    return () => {
      delete window[cbNameRef.current]
    }
  }, [siteKey])

  return (
    <div className={styles.captchaOverlay} onClick={onClose}>
      <div className={styles.captchaModal} onClick={e => e.stopPropagation()}>
        <div className={styles.captchaHeader}>
          <span>🔐 Connexion GPDIS - CAPTCHA requis</span>
          <button onClick={onClose}><X size={14}/></button>
        </div>
        <p className={styles.captchaDesc}>
          Veuillez résoudre le CAPTCHA ci-dessous pour vous connecter à GPdis.
        </p>
        <div className={styles.captchaWidget} ref={containerRef}/>
        {loading && <div className={styles.captchaLoading}><Loader size={16} className={styles.spin}/> Connexion en cours...</div>}
      </div>
    </div>
  )
}

const MARQUES_DISPONIBLES = ['ASKO', 'BEKO', 'AEG', 'BOSCH', 'SIEMENS', 'NEFF', 'SMEG', 'LG', 'SAMSUNG', 'WHIRLPOOL', 'MIELE', 'ELECTROLUX', 'CANDY', 'HAIER', 'FAGOR', 'AMICA']

export default function Explorateur() {
  const [urlSaisie,    setUrlSaisie]    = useState('')
  const [siteInfo,     setSiteInfo]     = useState(null)
  const [liens,        setLiens]        = useState([])
  const [loadingLiens, setLoadingLiens] = useState(false)

  const [marquesActives, setMarquesActives] = useState([])
  const [nouvelleMarque, setNouvelleMarque] = useState('')
  const [marquesDispos,  setMarquesDispos]  = useState(MARQUES_DISPONIBLES)
  const [showMarques,    setShowMarques]    = useState(false)
  const [menuOuvert,    setMenuOuvert]    = useState(true)

  const [loginVisible,  setLoginVisible]  = useState(false)
  const [loginUrl,        setLoginUrl]        = useState('')
  const [loginEmail,      setLoginEmail]      = useState('')
  const [loginPassword,   setLoginPassword]   = useState('')
  const [loginCodeClient, setLoginCodeClient] = useState('')
  const [showPwd,         setShowPwd]         = useState(false)
  const [loginLoading,  setLoginLoading]  = useState(false)
  const [loginStatus,   setLoginStatus]   = useState(null)

  const [cediSite,  setCediSite]  = useState(false)
  const [connecte,  setConnecte]  = useState(false)
  const [loginForce, setLoginForce] = useState(false)

  const [captchaVisible,  setCaptchaVisible]  = useState(false)
  const [captchaSiteKey,  setCaptchaSiteKey]  = useState('')
  const [captchaResolv,   setCaptchaResolv]   = useState(null)
  const captchaResolvRef = useRef(null)
  const [captchaLoading,  setCaptchaLoading]  = useState(false)

  const [lienActif,   setLienActif]   = useState(null)
  const [produits,    setProduits]    = useState([])
  const [loadingProd, setLoadingProd] = useState(false)

  const produitsFiltres = (() => {
    if (!marquesActives.length) return produits
    return produits.filter(p => {
      const pMarque = ((p.marque || '') + '').toUpperCase().trim()
      const nom = ((p.nom || '') + '').toUpperCase().trim()
      const ref = ((p.reference || '') + '').toUpperCase().trim()
      return marquesActives.some(m => {
        const marque = m.toUpperCase().trim()
        if (pMarque && pMarque.includes(marque)) return true
        if (nom.includes(marque) || nom.startsWith(marque)) return true
        if (ref.startsWith(marque)) return true
        return false
      })
    })
  })()

  const [ajoutsEnCours, setAjoutsEnCours] = useState({})
  const [edits, setEdits] = useState({})

  const [verifiees, setVerifiees] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('categoriesVerifiees') || '[]')) }
    catch { return new Set() }
  })
  const [filtreLien, setFiltreLien] = useState('')
  const [erreur,     setErreur]     = useState(null)
  const [toast,      setToast]      = useState(null)

  // Clé de cache pour les produits
  const cacheKeyProducts = useMemo(() => {
    if (!siteInfo?.url || !urlSaisie) return null
    return `explo_produits_${siteInfo.url}_${marquesActives.join('|')}`
  }, [siteInfo?.url, urlSaisie, marquesActives])

  // ── Fonctions de cache ───────────────────────────────────────
  const restaurerDepuisCache = useCallback(() => {
    if (!cacheKeyProducts) return

    const fromMemory = getCache(cacheKeyProducts, 300000)
    if (fromMemory?.produits?.length > 0) {
      setProduits(fromMemory.produits)
      setLoadingProd(false)
      setToast({ message: '📋 Résultats chargés depuis la mémoire', type: 'info' })
      setTimeout(() => setToast(null), 3000)
      return
    }

    if (siteInfo?.url) {
      const key = `explo_produits_local_${siteInfo.url}`
      const saved = localStorage.getItem(key)
      if (saved) {
        try {
          const produitsSaved = JSON.parse(saved)
          if (produitsSaved && produitsSaved.length > 0) {
            setProduits(produitsSaved)
            setLoadingProd(false)
            setToast({ message: '📋 Résultats restaurés depuis la mémoire persistante', type: 'info' })
            setTimeout(() => setToast(null), 3000)
          }
        } catch (e) {}
      }
    }
  }, [cacheKeyProducts, siteInfo?.url])

  const sauvegarderDansCache = useCallback((nouveauxProduits) => {
    if (!cacheKeyProducts || !siteInfo?.url) return

    setCache(cacheKeyProducts, {
      produits: nouveauxProduits,
      timestamp: Date.now(),
      url: siteInfo.url,
      marques: marquesActives,
      siteInfo: siteInfo
    }, 300000)

    const key = `explo_produits_local_${siteInfo.url}`
    localStorage.setItem(key, JSON.stringify(nouveauxProduits))

    setToast({ message: '💾 Résultats sauvegardés en mémoire', type: 'success' })
    setTimeout(() => setToast(null), 2000)
  }, [cacheKeyProducts, siteInfo, marquesActives])

  useEffect(() => {
    localStorage.setItem('categoriesVerifiees', JSON.stringify([...verifiees]))
  }, [verifiees])

  useEffect(() => {
    restaurerDepuisCache()
  }, [restaurerDepuisCache])

  useEffect(() => {
    if (produits.length > 0 && siteInfo?.url && cacheKeyProducts) {
      sauvegarderDansCache(produits)
    }
  }, [produits, siteInfo?.url, cacheKeyProducts, sauvegarderDansCache])

  // ── Modal d'ajout ─────────────────────────────────────────────
  const [modalAjout,   setModalAjout]   = useState(null)
  const [colonnesExcel, setColonnesExcel] = useState([])

  const toggleVerifie = (href, e) => {
    e.stopPropagation()
    setVerifiees(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  // ── Historique de navigation ──────────────────────────────
  const [historique, setHistorique] = useState([])

  useEffect(() => {
    const cachedCols = getCache('excel_colonnes', 60000)
    if (cachedCols) setColonnesExcel(cachedCols)

    const cachedHist = localStorage.getItem('historique_data')
    if (cachedHist) {
      try {
        const { data, ts } = JSON.parse(cachedHist)
        if (Date.now() - ts < 60000) { setHistorique(data); return }
      } catch {}
    }

    Promise.all([
      axios.get('/api/historique').catch(() => ({ data: [] })),
      axios.get('/api/excel/colonnes').catch(() => ({ data: { colonnes: ["REFERENCE","Nom","Prix"] } })),
    ]).then(([histRes, colsRes]) => {
      if (histRes) {
        const data = histRes.data || []
        setHistorique(data)
        localStorage.setItem('historique_data', JSON.stringify({ data, ts: Date.now() }))
      }
      if (colsRes) {
        setCache('excel_colonnes', colsRes.data.colonnes || [])
        setColonnesExcel(colsRes.data.colonnes || [])
      }
    })
  }, [])

  const ajouterHistorique = async (url, titre) => {
    try {
      const r = await axios.post('/api/historique', { url, titre })
      setHistorique(r.data.historique || [])
    } catch {}
  }
  const supprimerHistorique = async (url) => {
    try {
      const b64 = btoa(url)
      const r = await axios.delete(`/api/historique/${b64}`)
      setHistorique(r.data.historique || [])
    } catch {}
  }

  const toggleMarque = (m) => {
    setMarquesActives(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    )
  }
  const ajouterMarque = () => {
    const m = nouvelleMarque.trim().toUpperCase()
    if (!m) return
    if (!marquesDispos.includes(m)) setMarquesDispos(prev => [...prev, m])
    if (!marquesActives.includes(m)) setMarquesActives(prev => [...prev, m])
    setNouvelleMarque('')
  }

  const explorer = async (urlForce, forceReload = false) => {
    const url = (urlForce || urlSaisie).trim()
    if (!url.startsWith('http')) { setErreur('URL invalide — commencez par http'); return }
    setErreur(null); setLoadingLiens(true)
    setLiens([]); setSiteInfo(null); setLienActif(null); setProduits([])

    const cacheKey = 'explo_liens_' + url
    if (!forceReload) {
      const cached = getCache(cacheKey, 1800000)
      if (cached) {
        setLiens(cached.liens || [])
        setSiteInfo(cached.site || {})
        setCediSite(cached.cedi_site || false)
        setConnecte(cached.connecte || false)
        setLoadingLiens(false)
        if (cached.cedi_site && !cached.connecte) {
          setLoginVisible(true)
          setLoginForce(true)
          setToast({ message: '🔐 Connectez-vous à votre compte CEDI (email + N° client + mot de passe) pour accéder aux produits', type: 'info' })
        } else {
          setLoginForce(false)
          const aLogin = (cached.liens || []).some(l =>
            /login|connexion|compte|account|signin/i.test(l.href)
          )
          if (aLogin && !loginStatus) setLoginVisible(true)
        }
        return
      }
    }

    try {
      const res = await axios.post('/api/explorateur/liens', { url, force: forceReload })
      const d = res.data
      setCache(cacheKey, d)
      setLiens(d.liens || [])
      setSiteInfo(d.site || {})

      const isCedi = d.cedi_site || false
      const isConnected = d.connecte || false
      setCediSite(isCedi)
      setConnecte(isConnected)

      ajouterHistorique(url, d.site?.titre || url)

      if (isCedi && !isConnected) {
        setLoginVisible(true)
        setLoginForce(true)
        setToast({ message: '🔐 Connectez-vous à votre compte CEDI (email + N° client + mot de passe) pour accéder aux produits', type: 'info' })
      } else {
        setLoginForce(false)
        const aLogin = (d.liens || []).some(l =>
          /login|connexion|compte|account|signin/i.test(l.href)
        )
        if (aLogin && !loginStatus) setLoginVisible(true)
      }
    } catch (e) {
      setErreur(e.response?.data?.erreur || 'Impossible de charger le site')
    } finally { setLoadingLiens(false) }
  }

  const seConnecter = async () => {
    if (!loginEmail || !loginPassword) { setErreur('Identifiant et mot de passe requis'); return }
    setLoginLoading(true); setErreur(null)
    try {
      const res = await axios.post('/api/explorateur/login', {
        url_base: urlSaisie.trim(), login_url: loginUrl.trim() || null,
        email: loginEmail, password: loginPassword,
        code_client: loginCodeClient.trim() || null,
      })
      if (res.data.succes) {
        setLoginStatus('ok'); setConnecte(true); setLoginForce(false)
        setLoginVisible(false); setErreur(null)
        explorer(urlSaisie, true)
      } else {
        setLoginStatus('err'); setErreur(res.data.message || 'Connexion échouée')
      }
    } catch (e) {
      setLoginStatus('err'); setErreur(e.response?.data?.erreur || 'Erreur de connexion')
    } finally { setLoginLoading(false) }
  }

  const urlRef = useRef(urlSaisie)
  useEffect(() => { urlRef.current = urlSaisie }, [urlSaisie])

  const consulter = useCallback(async (lien, marques, siteUrl) => {
    if (cediSite && !connecte) {
      setLoginVisible(true)
      setToast({ message: '🔐 Connectez-vous d\'abord à votre compte CEDI', type: 'info' })
      return
    }
    const site = siteUrl || urlRef.current
    const marquesFinal = marques || marquesActives
    setLienActif(lien); setProduits([]); setLoadingProd(true)

    if (cacheKeyProducts && siteInfo?.url) {
      const fromCache = getCache(cacheKeyProducts, 300000)
      if (fromCache?.produits?.length > 0) {
        setProduits(fromCache.produits)
        setLoadingProd(false)
        return
      }
    }

    try {
      const res = await axios.post('/api/explorateur/produits', {
        url:    lien.href.startsWith('javascript:') || lien.href === '#' ? site : lien.href,
        marques: marquesFinal,
        site_url: site,
      })
      if (res.data.login_required) {
        setConnecte(false)
        setLoginVisible(true)
        setErreur(res.data.message || 'Connexion CEDI requise')
        setProduits([])
        return
      }
      if (res.data.captcha_required) {
        setCaptchaSiteKey(res.data.site_key)
        setCaptchaVisible(true)
        setCaptchaResolv({ lien, marques: marquesFinal, siteUrl: site })
        captchaResolvRef.current = { lien, marques: marquesFinal, siteUrl: site }
        setProduits([])
        return
      }
      const nouveauxProduits = res.data.produits || []
      setProduits(nouveauxProduits)
      if (cacheKeyProducts && siteInfo?.url) {
        setCache(cacheKeyProducts, {
          produits: nouveauxProduits,
          timestamp: Date.now(),
          url: siteInfo.url,
          marques: marquesFinal,
          siteInfo: siteInfo
        })
      }
      if (siteInfo?.url) {
        const key = `explo_produits_local_${siteInfo.url}`
        localStorage.setItem(key, JSON.stringify(nouveauxProduits))
      }
    } catch { setProduits([]) }
    finally { setLoadingProd(false) }
  }, [cacheKeyProducts, siteInfo, marquesActives, cediSite, connecte, urlRef])

  const soumettreCaptcha = useCallback(async (token) => {
    if (!token) return
    setCaptchaLoading(true)
    try {
      const res = await axios.post('/api/explorateur/captcha', {
        g_recaptcha_response: token,
        site: 'gpdis',
      })
      if (res.data.success) {
        setCaptchaVisible(false)
        setToast({ message: '✅ Connexion GPDIS réussie, re-scraping...', type: 'success' })
        setTimeout(() => setToast(null), 3000)
        const cr = captchaResolvRef.current
        if (cr) {
          consulter(cr.lien, cr.marques, cr.siteUrl)
        }
      }
    } catch (e) {
      setErreur(e.response?.data?.erreur || 'Erreur lors de la validation du CAPTCHA')
    } finally {
      setCaptchaLoading(false)
    }
  }, [consulter])

  const [pdfResultats,  setPdfResultats]  = useState({})
  const [pdfLoading,    setPdfLoading]    = useState({})

  const rechercherPdf = async (reference) => {
    if (pdfLoading[reference]) return
    setPdfLoading(prev => ({ ...prev, [reference]: true }))
    try {
      const res = await axios.get(`/api/pdf/rechercher/${encodeURIComponent(reference)}`, {
        params: { site_url: urlSaisie.trim() }
      })
      setPdfResultats(prev => ({ ...prev, [reference]: res.data.resultats || [] }))
    } catch {
      setPdfResultats(prev => ({ ...prev, [reference]: [] }))
    } finally {
      setPdfLoading(prev => ({ ...prev, [reference]: false }))
    }
  }

  const [lotMajLoading, setLotMajLoading] = useState(false)

  const toutMettreAJour = async () => {
    const a_mettre_a_jour = produitsFiltres.filter(p =>
      p._dans_excel === true && p.prix != null && p.reference && p.reference !== '—'
    )
    if (a_mettre_a_jour.length === 0) {
      setToast({ message: 'Aucun produit éligible à la mise à jour', type: 'info' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    const site = a_mettre_a_jour[0].site_excel || 'cedi'
    setLotMajLoading(true)
    setToast({ message: `Mise à jour de ${a_mettre_a_jour.length} produit(s)...`, type: 'info' })
    try {
      const r = await axios.post('/api/excel/mettre-a-jour-lot', {
        produits: a_mettre_a_jour.map(p => ({ reference: p.reference, nom: p.nom, prix: p.prix })),
        site,
      })
      setToast({ message: `✅ ${r.data.mis_a_jour} produit(s) mis à jour${r.data.introuvables?.length ? ` (${r.data.introuvables.length} ignoré(s))` : ''}`, type: 'success' })
      setProduits(prev => prev.map(p =>
        a_mettre_a_jour.some(aj => aj.reference === p.reference)
          ? { ...p, _mis_a_jour: true }
          : p
      ))
      setTimeout(() => setToast(null), 5000)
    } catch (e) {
      setErreur(e.response?.data?.erreur || 'Erreur mise à jour groupée')
    }
    setLotMajLoading(false)
  }

  const mettreAJour = async (produit) => {
    const key = `update_${produit.reference}`
    setAjoutsEnCours(prev => ({ ...prev, [key]: 'loading' }))
    try {
      await axios.post('/api/excel/mettre-a-jour', {
        reference: produit.reference,
        site: produit.site_excel || 'cedi',
        prix: produit.prix,
      })
      setAjoutsEnCours(prev => ({ ...prev, [key]: 'done' }))
      setToast({ message: `"${produit.reference}" mis à jour`, type: 'success' })
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      const msg = e.response?.data?.erreur || 'Erreur mise à jour'
      setErreur(msg)
      setToast({ message: `❌ ${msg}`, type: 'err' })
      setAjoutsEnCours(prev => ({ ...prev, [key]: 'err' }))
      setTimeout(() => { setAjoutsEnCours(prev => { const n = {...prev}; delete n[key]; return n }); setToast(null) }, 4000)
    }
  }

  const detecterSite = (url) => {
    try {
      const domain = new URL(url).hostname.toLowerCase()
      for (const s of ['cedi', 'gpdis', 'findis', 'sogam']) {
        if (domain.includes(s)) return s
      }
    } catch (e) { /* ignore */ }
    return null
  }

  const ajouterDansExcel = async (produit) => {
    const key = produit.reference || produit.nom
    setAjoutsEnCours(prev => ({ ...prev, [key]: 'loading' }))
    try {
      const site = detecterSite(urlRef.current)
      const ecoVal = edits[`eco_${key}`]
      const pcVal = edits[`pc_${key}`]
      const frais = detecterFrais(produit.nom)
      const ecoPartValue = ecoVal !== undefined && ecoVal !== '' ? parseFloat(ecoVal) : 0
      let miniCalcule = (parseFloat(produit.prix) + ecoPartValue + frais) * 1.2
      if (site === 'gpdis') miniCalcule /= 0.98
      await axios.post('/api/excel/ajouter-produit', {
        reference: produit.reference, nom: produit.nom,
        prix: produit.prix, site: site,
        eco_part: ecoVal ? parseFloat(ecoVal) : null,
        prix_comparer: pcVal || null,
        mini: Math.round(miniCalcule * 100) / 100,
      })
      setProduits(prev => prev.map(p =>
        (p.reference === produit.reference && p.nom === produit.nom)
          ? { ...p, _dans_excel: true } : p
      ))
      setAjoutsEnCours(prev => ({ ...prev, [key]: 'done' }))
      setToast({ message: `"${produit.reference || produit.nom}" ajouté à l'Excel`, type: 'success' })
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      const msg = e.response?.data?.erreur || 'Erreur ajout'
      setErreur(msg)
      setToast({ message: `❌ ${msg}`, type: 'err' })
      setAjoutsEnCours(prev => ({ ...prev, [key]: 'err' }))
      setTimeout(() => { setAjoutsEnCours(prev => { const n = {...prev}; delete n[key]; return n }); setToast(null) }, 4000)
    }
  }

  const q = filtreLien.toLowerCase()

  const liensProduits = liens.filter(l => {
    if (l.categorie === 'Produits / Catégories') return true
    if (l.type_produit) return true
    const href = (l.href || '').toLowerCase()
    const texte = (l.texte || '').toLowerCase()
    const motsCles = ['pose-libre', 'pose_libre', 'poselibre', 'pose libre', 'encastrable',
      'cuisiniere', 'piano-de-cuisson', 'four', 'table-cuisson', 'lave-linge',
      'seche-linge', 'lave-vaisselle', 'micro-onde', 'hotte', 'tiroir',
      'produit', 'product', 'famille', 'categorie', 'category', 'catalog']
    if (motsCles.some(m => href.includes(m) || texte.includes(m))) return true
    return false
  }).filter(l =>
    !q || l.texte.toLowerCase().includes(q) || l.href.toLowerCase().includes(q)
  )

  const detecterCategorie = (lien) => {
    if (lien.type_produit === 'pose_libre') return 'pose_libre'
    if (lien.type_produit === 'encastrable') return 'encastrable'

    const href = (lien.href || '').toLowerCase()
    const texte = (lien.texte || '').toLowerCase()
    const cat = (lien.categorie || '').toLowerCase()
    const tout = `${href} ${texte} ${cat}`

    const POSE_LIBRE = [
      'pose-libre', 'pose_libre', 'poselibre', 'pose libre',
      'free-standing', 'freestanding', 'standalone',
      'independant', 'indépendant', 'solo',
      'cuisiniere', 'piano-de-cuisson', 'piano de cuisson',
      'lave-linge-top', 'seche-linge',
      'refrigerateur-americain', 'americain',
      'congelateur-vertical', 'congelateur-coffre',
      'lave linge', 'seche linge',
      'cuisinière', 'piano de cuisson', 'réfrigérateur américain',
      'congélateur', 'coffre', 'vertical',
    ]
    const ENCASTRABLE = [
      'encastrable', 'a encastrer', 'à encastrer',
      'built-in', 'builtin', 'encastrer',
      'integrable', 'intégrer', 'integ',
      'four-encastrable', 'table-cuisson', 'table de cuisson',
      'tiroir', 'hotte', 'micro-onde-encastrable',
      'lave-vaisselle-encastrable', 'refrigerateur-encastrable',
      'cave-a-vin-encastrable',
      'four', 'table de cuisson', 'micro-onde',
      'lave-vaisselle', 'réfrigérateur encastrable',
      'cave à vin', 'tiroir de cuisson',
    ]

    const estPL = POSE_LIBRE.some(m => tout.includes(m))
    const estEN = ENCASTRABLE.some(m => tout.includes(m))

    if (estPL && !estEN) return 'pose_libre'
    if (estEN && !estPL) return 'encastrable'
    if (estPL && estEN) return tout.includes('encastrable') ? 'encastrable' : 'pose_libre'
    return null
  }

  const dedupeLiens = (arr) => {
    const vus = new Set()
    return arr.filter(l => {
      const url = l.href.replace(/\/+$/, '').split('?')[0].split('#')[0]
      if (vus.has(url)) return false
      vus.add(url)
      return true
    })
  }

  const groupePoseLibre = []
  const groupeEncastrable = []
  const nonClasses = []
  dedupeLiens(liensProduits).forEach(l => {
    const cat = detecterCategorie(l)
    if (cat === 'pose_libre') groupePoseLibre.push(l)
    else if (cat === 'encastrable') groupeEncastrable.push(l)
    else nonClasses.push(l)
  })

  const categoriesTriees = [
    { nom: 'Pose libre', liens: groupePoseLibre },
    { nom: 'Encastrable', liens: groupeEncastrable },
    { nom: 'Non classé', liens: nonClasses },
  ]

  // ── Recevoir l'URL depuis le Sidebar (historique) ──────────
  const location = useLocation()
  useEffect(() => {
    if (location.state?.url) {
      setUrlSaisie(location.state.url)
      explorer(location.state.url)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  // ── Restaurer l'état après rafraîchissement ─────────────────
  const CACHE_VERSION = 2
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('explorateur_state') || '{}')
      if (saved._v !== CACHE_VERSION) {
        localStorage.removeItem('explorateur_state')
        return
      }
      if (saved.url) setUrlSaisie(saved.url)
      if (saved.marques) setMarquesActives(saved.marques)
      if (saved.marquesDispos) setMarquesDispos(saved.marquesDispos)
    } catch {}
  }, [])

  const premierRendu = useRef(true)
  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return }
    try {
      localStorage.setItem('explorateur_state', JSON.stringify({
        _v: CACHE_VERSION,
        url: urlSaisie, marques: marquesActives, marquesDispos, lienActif, siteInfo,
        liens: urlSaisie ? liens : [],
      }))
    } catch {}
  }, [urlSaisie, marquesActives, lienActif, siteInfo, liens])

  const detecterFrais = (nom) => {
    const n = (nom || '').toUpperCase()
    const GRANDS = [
      'REFRIGERATEUR', 'CONGELATEUR', 'CAVE A VIN', 'CAVE-A-VIN',
      'LAVE LINGE', 'LAVE-LINGE', 'SECHE LINGE', 'SECHE-LINGE',
      'LAVE VAISSELLE', 'LAVE-VAISSELLE', 'CUISINIERE', 'CUISIERE',
      'PIANO DE CUISSON', 'PIANO-DE-CUISSON', 'FOUR',
      'AMERICAIN', 'CONGELATEUR COFFRE', 'CONGELATEUR VERTICAL'
    ]
    return GRANDS.some(g => n.includes(g)) ? 80 : 60
  }

  const couleur = (p) => {
    if (p._dans_excel === true)  return styles.rowJaune
    if (p._dans_excel === false) return styles.rowVert
    return ''
  }

  return (
    <div className={styles.page}>

      <div className={styles.topBar}>
        <div className={styles.urlBar}>
          <Globe size={15} className={styles.urlIcon} />
          <input type="url" value={urlSaisie}
            onChange={e => setUrlSaisie(e.target.value)}
            placeholder="https://www.monsite.com"
            onKeyDown={e => e.key === 'Enter' && explorer()} />
          <button className={styles.btnPrimary} onClick={() => explorer()} disabled={loadingLiens}>
            {loadingLiens ? <><Loader size={14} className={styles.spin}/> Chargement...</> : <><Search size={14}/> Analyser</>}
          </button>
          {siteInfo && (
            <button className={styles.btnLogin + (loginStatus === 'ok' ? ' ' + styles.btnLoginOk : '')}
              onClick={() => setLoginVisible(v => !v)}>
              <Lock size={14}/> {loginStatus === 'ok' ? 'Connecté' : 'Connexion'}
            </button>
          )}
        </div>

        {siteInfo && (
          <div className={styles.siteInfo}>
            <span className={styles.siteTitre}>{siteInfo.titre}</span>
            <span className={styles.siteBadge}>{liensProduits.length} catégorie(s)</span>
            {loginStatus === 'ok' && <span className={styles.connectedBadge}>🔐 Connecté</span>}
          </div>
        )}

        {erreur && (
          <div className={styles.erreur}>{erreur}
            <button onClick={() => setErreur(null)}><X size={13}/></button>
          </div>
        )}

        {loginVisible && (
          <div className={`${styles.loginPanel} ${cediSite && !connecte ? styles.loginPanelCedi : ''}`}>
            <div className={styles.loginPanelHeader}>
              <Lock size={15}/>
              {cediSite && !connecte ? '🔐 Connexion CEDI requise' : 'Connexion au site'}
              {!loginForce && (
                <button className={styles.loginClose} onClick={() => setLoginVisible(false)}><X size={14}/></button>
              )}
            </div>
            {cediSite && !connecte && (
              <div className={styles.loginCediMessage}>
                Vous devez être connecté à votre compte CEDI pour accéder aux produits.
              </div>
            )}
            <div className={styles.loginFields}>
              <input type="url" value={loginUrl} onChange={e => setLoginUrl(e.target.value)}
                placeholder="URL de connexion (optionnel)" />
              <input type="text" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                placeholder="Email / identifiant *" />
              <input type="text" value={loginCodeClient} onChange={e => setLoginCodeClient(e.target.value)}
                placeholder="N° compte client (si requis)" />
              <div className={styles.pwdWrap}>
                <input type={showPwd ? 'text' : 'password'} value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)} placeholder="Mot de passe *" />
                <button type="button" onClick={() => setShowPwd(v => !v)}>
                  {showPwd ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              <button className={styles.btnConnexion} onClick={seConnecter} disabled={loginLoading}>
                {loginLoading ? <><Loader size={14} className={styles.spin}/> Connexion...</> : <><LogIn size={14}/> Se connecter</>}
              </button>
            </div>
          </div>
        )}

        {captchaVisible && (
          <CaptchaModal
            siteKey={captchaSiteKey}
            onSolve={soumettreCaptcha}
            onClose={() => setCaptchaVisible(false)}
            loading={captchaLoading}
          />
        )}
      </div>

      {(liens.length > 0 || loadingLiens) && (
        <div className={styles.layout}>

          <aside className={`${styles.menu}${!menuOuvert ? ' ' + styles.menuFerme : ''}`}>
            <div className={styles.menuTop}>
              <span>Catégories</span>
              <div style={{display:'flex', gap:4,alignItems:'center'}}>
                <button onClick={() => explorer(urlSaisie, true)} title="Recharger"><RefreshCw size={12}/></button>
                <button onClick={() => setMenuOuvert(v=>!v)} title={menuOuvert?'Réduire':'Développer'}>
                  <ChevronLeft size={14} style={{transform:menuOuvert?'rotate(0deg)':'rotate(180deg)',transition:'transform .2s'}}/>
                </button>
              </div>
            </div>

            {menuOuvert && (<>
            <div className={styles.marquesSection}>
              <button className={styles.marquesToggle} onClick={() => setShowMarques(v => !v)}>
                  🏷️ Marques {marquesActives.length > 0 ? `(${marquesActives.length} active${marquesActives.length > 1 ? 's' : ''})` : '(toutes)'}
                  <span>{showMarques ? '▲' : '▼'}</span>
                </button>
              {showMarques && (
                <div className={styles.marquesPanel}>
                  <div className={styles.marquesGrid}>
                    {marquesDispos.map(m => (
                      <label key={m} className={styles.marqueLabel}>
                        <input
                          type="checkbox"
                          checked={marquesActives.includes(m)}
                          onChange={() => toggleMarque(m)}
                        />
                        <span className={marquesActives.includes(m) ? styles.marqueOn : ''}>{m}</span>
                      </label>
                    ))}
                  </div>
                  <div className={styles.marquesAdd}>
                    <input
                      placeholder="Autre marque..."
                      value={nouvelleMarque}
                      onChange={e => setNouvelleMarque(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && ajouterMarque()}
                    />
                    <button onClick={ajouterMarque}>+</button>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.menuSearch}>
              <input placeholder="Filtrer les liens..." value={filtreLien}
                onChange={e => setFiltreLien(e.target.value)} />
            </div>

            <div className={styles.menuBody}>
              {loadingLiens ? (
                <div className={styles.menuLoading}><ProgressBar /></div>
              ) : liensProduits.length === 0 ? (
                <div className={styles.menuVide}>Aucune catégorie produit trouvée sur ce site</div>
              ) : (
                categoriesTriees.map(g => (
                  <div key={g.nom} className={styles.groupe}>
                    <div className={styles.groupeTitre}>
                      {g.nom} <span>{g.liens.length}</span>
                    </div>
                    {g.liens.map((l, i) => {
                      const estVerifie = verifiees.has(l.href)
                      return (
                      <div key={i}
                        className={`${styles.menuItem}${lienActif?.href === l.href ? ' ' + styles.menuActif : ''}${estVerifie ? ' ' + styles.menuVerifie : ''}${cediSite && !connecte ? ' ' + styles.menuLocked : ''}`}
                        onClick={() => cediSite && !connecte ? (setLoginVisible(true), setToast({ message: '🔐 Connectez-vous d\'abord à CEDI', type: 'info' })) : consulter(l)}
                        title={(cediSite && !connecte ? '🔒 Connectez-vous d\'abord - ' : '') + (l.texte || l.href.split('/').filter(Boolean).pop()) + '\n' + l.href}>
                        <span onClick={e => toggleVerifie(l.href, e)} style={{display:'flex',cursor:'pointer',flexShrink:0}}>
                          {estVerifie ? <CheckSquare size={13} color="#22c55e"/> : <Square size={13} color="var(--text2)"/>}
                        </span>
                        <ChevronRight size={11} className={styles.menuArrow}/>
                        <span className={styles.menuTexte} title={l.texte || l.href.split('/').filter(Boolean).pop()}>
                          {l.texte || l.href.split('/').filter(Boolean).pop()}
                        </span>
                        <a href={l.href} target="_blank" rel="noreferrer"
                          className={styles.menuExt} onClick={e => e.stopPropagation()}>
                          <ExternalLink size={10}/>
                        </a>
                      </div>
                    )})}
                  </div>
                ))
              )}
            </div>
            </> )}
          </aside>

          <section className={styles.contenu}>
            {!lienActif ? (
              <div className={styles.placeholder}>
                <Globe size={44} style={{ opacity: .15 }}/>
                <p>Cliquez sur un lien à gauche</p>
                <span>Les produits {marquesActives.length > 0 ? `(${marquesActives.join(', ')})` : ''} s'afficheront ici</span>
              </div>
            ) : (
              <>
                <div className={styles.contenuHeader}>
                  <div className={styles.contenuTitre}>{lienActif.texte || lienActif.href}</div>
                  <a href={lienActif.href} target="_blank" rel="noreferrer" className={styles.contenuUrl}>
                    <ExternalLink size={12}/> {lienActif.href}
                  </a>
                </div>

                <div className={styles.legende}>
                  <span>Marques : <strong>{marquesActives.join(', ') || 'toutes'}</strong></span>
                  <span className={styles.legendeJaune}>■ Existe dans Excel</span>
                  <span className={styles.legendeVert}>■ Nouveau → bouton Ajouter</span>
                </div>

                {loadingProd ? (
                  <div className={styles.loading}><ProgressBar /></div>
                ) : produits.length === 0 ? (
                  <div className={styles.vide}>
                    <Package size={32} style={{ opacity: .2 }}/>
                    <p>Aucun produit trouvé sur cette page</p>
                    <span>Le site peut avoir une structure différente, ou la page ne contient pas de produits</span>
                  </div>
                ) : produitsFiltres.length === 0 ? (
                  <div className={styles.vide}>
                    <Package size={32} style={{ opacity: .2 }}/>
                    <p>Aucun produit ne correspond aux marques sélectionnées</p>
                    <span>Essayez de sélectionner d'autres marques ou désélectionnez toutes les marques pour voir tous les produits</span>
                  </div>
                ) : (
                    <div className={styles.tableWrap}>
                    <div className={styles.tableCount}>
                      <span>{produitsFiltres.length} / {produits.length} produit(s)</span>
                      <button className={styles.btnMajLot}
                        onClick={toutMettreAJour}
                        disabled={lotMajLoading}>
                        {lotMajLoading
                          ? <><Loader size={13} className={styles.spin}/> Màj en cours...</>
                          : <><RefreshCw size={13}/> Tout Màj</>}
                      </button>
                    </div>
                    <table className={styles.table}>
                      <colgroup>
                        <col className={styles.colNum}/>
                        <col className={styles.colPhoto}/>
                        <col className={styles.colRef}/>
                        <col className={styles.colNom}/>
                        <col className={styles.colPrixExcel}/>
                        <col className={styles.colPrixSite}/>
                        <col className={styles.colEco}/>
                        <col className={styles.colMini}/>
                        <col className={styles.colComparer}/>
                        <col className={styles.colPdf}/>
                        <col className={styles.colStatut}/>
                      </colgroup>
                      <thead>
                        <tr><th>#</th><th>Photo</th><th>Réf.</th><th>Nom</th><th>Prix Excel</th><th>Prix Site</th><th>Eco Part</th><th>Mini</th><th>Px Comparer</th><th>PDF</th><th>Statut</th></tr>
                      </thead>
                      <tbody>
                        {produitsFiltres.map((p, i) => {
                          const key = p.reference || p.nom
                          const ajoutEtat = ajoutsEnCours[key]
                          return (
                            <tr key={i} className={couleur(p)}>
                              <td className={styles.num}>{i+1}</td>
                              <td className={styles.photoCell}>
                                {p.image
                                  ? <a href={p.image} target="_blank" rel="noreferrer">
                                      <img src={p.image} alt={p.nom} className={styles.prodImg}/>
                                    </a>
                                  : <span className={styles.noImg}>—</span>
                                }
                              </td>
                              <td><code className={styles.ref}>{p.reference || '—'}</code></td>
                              <td>{p.nom || '—'}</td>
                              <td>
                                {p.excel_prices && Object.keys(p.excel_prices).length > 0 ? (
                                  <span className={styles.prixDual}>
                                    {Object.entries(p.excel_prices).map(([s, pr]) => (
                                      <span key={s}
                                        className={s === p.site_excel ? styles.prix : styles.excelOther}>
                                        {s.toUpperCase()+' '+parseFloat(pr).toFixed(2)+' €'}
                                      </span>
                                    ))}
                                  </span>
                                ) : p.prix_excel != null ? (
                                  <span className={styles.prix}>
                                    {(p.site_excel || 'Excel').toUpperCase()+' '+parseFloat(p.prix_excel).toFixed(2)+' €'}
                                  </span>
                                ) : (
                                  <span className={styles.badgeGris}>—</span>
                                )}
                              </td>
                              <td>
                                {p.prix != null ? (
                                  <span className={styles.prix}>{parseFloat(p.prix).toFixed(2)+' €'}</span>
                                ) : (
                                  <span className={styles.badgeGris}>—</span>
                                )}
                              </td>
                              <td className={styles.prix}>
                                {p.eco_part != null ? `${parseFloat(p.eco_part).toFixed(2)} €` : (
                                  p._dans_excel ? <span className={styles.badgeGris}>—</span> : (
                                    <input type="number" step="0.01"
                                      value={edits[`eco_${key}`] ?? ''}
                                      onChange={e => setEdits(prev => ({...prev, [`eco_${key}`]: e.target.value}))}
                                      placeholder="Eco part"
                                      className={styles.editInput}
                                      onClick={e => e.stopPropagation()}
                                    />
                                  )
                                )}
                              </td>
                              <td>
                                <span className={styles.prixDual}>
                                  {p.mini != null && (
                                    <span className={styles.miniExcel}>{parseFloat(p.mini).toFixed(2)} €</span>
                                  )}
                                  {p.prix != null && (p.eco_part != null || (edits[`eco_${key}`] !== undefined && edits[`eco_${key}`] !== '')) && (
                                    <span className={styles.miniSite}>
                                      {(() => {
                                        const frais = detecterFrais(p.nom)
                                        const ecoValue = edits[`eco_${key}`] !== undefined && edits[`eco_${key}`] !== ''
                                          ? parseFloat(edits[`eco_${key}`])
                                          : (p.eco_part != null ? parseFloat(p.eco_part) : 0)
                                        let miniCalcule = (parseFloat(p.prix) + ecoValue + frais) * 1.2
                                        if (p.site_excel === 'gpdis') miniCalcule /= 0.98
                                        return (
                                          <>
                                            {miniCalcule < parseFloat(p.mini || 999999) ? '▲ ' : '▼ '}
                                            {miniCalcule.toFixed(2)} €
                                          </>
                                        )
                                      })()}
                                    </span>
                                  )}
                                  {p.mini == null && (p.prix == null || p.eco_part == null) && (
                                    p._dans_excel ? <span className={styles.badgeGris}>—</span> : '—'
                                  )}
                                </span>
                              </td>
                              <td className={styles.comparer}>
                                 {p.prix_comparer != null ? (
                                   <span className={styles.comparerVal}>
                                     {p.prix_comparer}
                                   </span>
                                ) : (
                                  <div style={{display:'flex', gap:4, alignItems:'center'}}>
                                    <span className={styles.badgeGris}>—</span>
                                    <input type="text"
                                      value={edits[`pc_${key}`] ?? ''}
                                      onChange={e => setEdits(prev => ({...prev, [`pc_${key}`]: e.target.value}))}
                                      placeholder="Entrer manuelle"
                                      className={styles.editInput}
                                      onClick={e => e.stopPropagation()}
                                      style={{maxWidth:140}}
                                    />
                                  </div>
                                )}
                              </td>
                              <td>
                                {p.reference && p.reference !== '—' ? (
                                  <div className={styles.pdfCell}>
                                    {!pdfResultats[p.reference] ? (
                                      <button
                                        className={styles.pdfSearchBtn}
                                        onClick={() => rechercherPdf(p.reference)}
                                        disabled={pdfLoading[p.reference]}
                                        title="Chercher le PDF sur le site"
                                      >
                                        {pdfLoading[p.reference]
                                          ? <Loader size={11} className={styles.spin}/>
                                          : '🔍'}
                                        {pdfLoading[p.reference] ? '' : 'Chercher'}
                                      </button>
                                    ) : pdfResultats[p.reference].length === 0 ? (
                                      <button
                                        className={styles.pdfSearchBtn}
                                        onClick={() => {
                                          setPdfResultats(prev => { const n = {...prev}; delete n[p.reference]; return n })
                                          rechercherPdf(p.reference)
                                        }}
                                        title="Aucun résultat, réessayer"
                                      >
                                        🔄 Réessayer
                                      </button>
                                    ) : (
                                      <div className={styles.pdfLinks}>
                                        {pdfResultats[p.reference].slice(0, 3).map((r, ri) => (
                                          <div key={ri} className={styles.pdfLinkRow}>
                                            <a href={r.url} target="_blank" rel="noreferrer"
                                              className={styles.pdfWebBtn}
                                              title={r.texte}>
                                              {r.type === 'pdf_direct' ? '⬇️' : '🔗'}
                                              {r.type === 'pdf_direct' ? 'PDF' : r.type === 'manualslib' ? 'ManualsLib' : 'Lien'}
                                            </a>
                                            <button
                                              className={styles.copyBtn}
                                              onClick={() => {
                                                navigator.clipboard.writeText(r.url)
                                                  .then(() => {
                                                    const btn = document.activeElement?.querySelector('svg') || document.activeElement
                                                    if (btn) {
                                                      const orig = btn.innerHTML
                                                      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
                                                      setTimeout(() => { btn.innerHTML = orig }, 1500)
                                                    }
                                                  })
                                              }}
                                              title="Copier le lien"
                                            ><Copy size={12}/></button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className={styles.badgeGris}>—</span>
                                )}
                              </td>
                              <td>
                                {p._dans_excel === true && (
                                  p._mis_a_jour || ajoutsEnCours[`update_${p.reference}`] === 'done'
                                    ? <span className={styles.badgeJaune}>✓ Mis à jour</span>
                                    : <button className={styles.btnMaj}
                                        onClick={() => mettreAJour(p)}
                                        disabled={ajoutsEnCours[`update_${p.reference}`] === 'loading'}>
                                        {ajoutsEnCours[`update_${p.reference}`] === 'loading'
                                          ? <><Loader size={12} className={styles.spin}/> Màj...</>
                                          : <><RefreshCw size={12}/> Màj</>}
                                      </button>
                                )}
                                {p._dans_excel === false && (
                                  ajoutEtat === 'done'
                                    ? <span className={styles.badgeJaune}>✓ Ajouté</span>
                                    : <button className={styles.btnAjouter}
                                        onClick={() => setModalAjout(p)}
                                        disabled={ajoutEtat === 'loading'}>
                                        {ajoutEtat === 'loading'
                                          ? <Loader size={12} className={styles.spin}/>
                                          : <PlusCircle size={12}/>}
                                        {ajoutEtat === 'loading' ? 'Ajout...' : 'Ajouter'}
                                      </button>
                                )}
                                {p._dans_excel === null && <span className={styles.badgeGris}>—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {liens.length === 0 && !loadingLiens && !siteInfo && (
        <div className={styles.accueil}>
          <Globe size={56} style={{ opacity: .12 }}/>
          <h2>Explorez un site</h2>
          <p>Entrez une URL et cliquez sur <strong>Explorer</strong></p>
          <p className={styles.accueilSub}>
            Les catégories produits du site apparaîtront dans le panneau gauche.<br/>
            Cliquez sur une catégorie pour extraire les produits et les comparer à votre fichier Excel.
          </p>
        </div>
      )}

      {/* ── Modal confirmation Ajout ──────────────────────────── */}
      {modalAjout && (
        <div className={styles.overlay} onClick={() => setModalAjout(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <PlusCircle size={16}/> Confirmer l'ajout dans l'Excel
              <button className={styles.modalClose} onClick={() => setModalAjout(null)}><X size={14}/></button>
            </div>
            <div className={styles.modalBody}>
              <p>Le produit suivant va être ajouté :</p>
              <table className={styles.modalTable}>
                <thead><tr><th>Colonne</th><th>Valeur</th></tr></thead>
                <tbody>
                  {(() => {
                    const n = s => {
                      if (!s) return ''
                      let h = s.toUpperCase()
                      if (/[\u00c0-\u00ff]/.test(h)) {
                        try {
                          const bytes = new Uint8Array(h.length)
                          for (let j = 0; j < h.length; j++) bytes[j] = h.charCodeAt(j) & 0xFF
                          h = new TextDecoder('utf-8').decode(bytes).toUpperCase()
                        } catch {}
                      }
                      return h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '')
                    }
                    const match = (col, keywords) => {
                      const nc = n(col)
                      return keywords.some(k => nc.includes(n(k)) || n(k).includes(nc))
                    }
                    const mKey = modalAjout.reference || modalAjout.nom
                    return colonnesExcel.filter(c => c && c.trim()).map((col, i) => {
                      let val = '—'
                      if (match(col, ['REFERENCE','REF','SKU','CODE']))
                        val = modalAjout.reference || '—'
                      else if (match(col, ['NOM','DESIGNATION','LIBELLE','DESCRIPTION','PRODUIT','ARTICLE']))
                        val = modalAjout.nom || '—'
                      else if (match(col, ['PRIX','TARIF','COUT','COST','AMOUNT','PRIXFACTURE']))
                        val = modalAjout.prix || '—'
                      else if (match(col, ['CEDI','GPDIS','FINDIS','SOGAM']))
                        val = modalAjout.prix || '—'
                      else if (n(col).includes('ECO') && n(col).includes('PART'))
                        val = edits[`eco_${mKey}`] || modalAjout.eco_part || '—'
                      else if (n(col).includes('PRIX') && (n(col).includes('COMPAR') || n(col).includes('COMPARER')))
                        val = edits[`pc_${mKey}`] || modalAjout.prix_comparer || '—'
                      else if (n(col) === 'MINI')
                        val = (() => {
                          const ecoV = edits[`eco_${mKey}`] !== undefined && edits[`eco_${mKey}`] !== ''
                            ? parseFloat(edits[`eco_${mKey}`])
                            : (modalAjout.eco_part != null ? parseFloat(modalAjout.eco_part) : 0)
                          const fraisM = detecterFrais(modalAjout.nom)
                          let miniM = (parseFloat(modalAjout.prix) + ecoV + fraisM) * 1.2
                          if (detecterSite(urlRef.current) === 'gpdis') miniM /= 0.98
                          return miniM.toFixed(2) + ' €'
                        })()
                      return (
                        <tr key={i}>
                          <td className={styles.modalCol}>{col || `Colonne ${i+1}`}</td>
                          <td className={styles.modalVal}>{val}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnAnnuler} onClick={() => setModalAjout(null)}>Annuler</button>
              <button className={styles.btnConfirmer} onClick={() => {
                const p = modalAjout
                setModalAjout(null)
                ajouterDansExcel(p)
              }}>Ajouter au fichier</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={styles.toast + ' ' + styles['toast'+toast.type]}>
          <CheckCircle size={16}/>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)}><X size={14}/></button>
        </div>
      )}
    </div>
  )
}