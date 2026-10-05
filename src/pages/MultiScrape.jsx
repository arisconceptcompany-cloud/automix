import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import {
  Rocket, Search, RefreshCw, Trash2, CheckCircle2, XCircle,
  NotebookPen, Loader, CheckSquare, Square, ListFilter,
  Maximize2, Minimize2
} from 'lucide-react'
import axios from 'axios'
import ProgressBar from '../components/ProgressBar'
import styles from './MultiScrape.module.css'

const SITES = ['cedi', 'findis', 'gpdis', 'sogam']
const SITE_LABEL = { cedi: 'CEDI', findis: 'FINDIS', gpdis: 'GPDIS', sogam: 'SOGAM' }
const SITE_EXCEL_KEY = { cedi: 'cedi', findis: 'findis', gpdis: 'gpdis', sogam: 'sogam' }
const SESSION_KEY = 'multiscrape_session_v1'
/** Marqueur d'un champ volontairement effacé : distingue "rien saisi" de "prix abandonné". */
const EFFACE = '__absent__'
/** Valeur écrite dans la colonne Conc 1 de l'Excel quand le prix concurrent est abandonné. */
const CONC1_ABSENT = 'Introuvable'

const num = (v) => {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

const prixDepuisTexte = (t) => {
  const m = String(t ?? '').match(/-?\d+([.,]\d+)?/)
  return m ? parseFloat(m[0].replace(',', '.')) : null
}

const repair = (s) => {
  try {
    const bytes = new Uint8Array([...s].map(ch => ch.charCodeAt(0) & 0xFF))
    const dec = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    if (!dec.includes('\uFFFD')) return dec
    return s
  } catch {
    return s
  }
}

const norm = (s = '') =>
  repair(String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim()

const val = (o, keys) => {
  if (!o) return undefined
  if (typeof keys === 'string') keys = [keys]
  const entries = Object.entries(o)
  for (const k of keys) {
    for (const [ek, ev] of entries) if (norm(ek) === norm(k)) return ev
  }
  return undefined
}

const setCle = (o, key, value) => {
  const out = { ...o }
  for (const k of Object.keys(out)) {
    if (norm(k) === norm(key)) delete out[k]
  }
  out[key] = value
  return out
}

// Objet stylique hoisté : passé en prop à SaisieChamp (memo), un littéral
// inline serait une nouvelle référence à chaque rendu et neutraliserait le memo.
const STYLE_FR = { width: 52 }

const SaisieChamp = memo(function SaisieChamp({
  onCommit, ligne, field, value, placeholder, title, inputMode, className, extraStyle,
}) {
  const [txt, setTxt] = useState(value ?? '')
  const premier = useRef(true)
  const derniereValeur = useRef(value ?? '')

  useEffect(() => {
    if (premier.current) { premier.current = false; return }
    if (value === derniereValeur.current) return
    derniereValeur.current = value ?? ''
    setTxt(value ?? '')
  }, [value])

  useEffect(() => {
    if (premier.current) return
    if (txt === derniereValeur.current) return
    const t = setTimeout(() => {
      derniereValeur.current = txt
      onCommit(ligne, field, txt)
    }, 350)
    return () => clearTimeout(t)
  }, [txt, onCommit, ligne, field])

  return (
    <input
      className={className}
      inputMode={inputMode}
      style={extraStyle}
      placeholder={placeholder}
      title={title}
      value={txt}
      onChange={e => setTxt(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={() => {
        derniereValeur.current = txt
        onCommit(ligne, field, txt)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          derniereValeur.current = txt
          onCommit(ligne, field, txt)
        }
      }}
    />
  )
})

export default function MultiScrape() {
  const [produits, setProduits] = useState([])
  const [refsSel, setRefsSel] = useState([])
  const [filtre, setFiltre] = useState('')
  const [sitesActifs, setSitesActifs] = useState(Object.fromEntries(SITES.map(s => [s, true])))

  const [jobId, setJobId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [fait, setFait] = useState(0)
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState(null)
  const [results, setResults] = useState({})
  const [conc1Map, setConc1Map] = useState({})
  const [dispoMap, setDispoMap] = useState({})
  const [doneRefs, setDoneRefs] = useState([])
  const [refsInfo, setRefsInfo] = useState({})
  const [jobMsg, setJobMsg] = useState('')

  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [busyRefs, setBusyRefs] = useState({})
  const [pleinEcran, setPleinEcran] = useState(false)
  const [manuels, setManuels] = useState({})
  const [saved, setSaved] = useState({})
  const [jaunes, setJaunes] = useState({})

  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(null)

  const [masquerTraitees, setMasquerTraitees] = useState(true)
  const [sessionExiste, setSessionExiste] = useState(false)
  const restoredSelRef = useRef(null)

  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const pushToast = (ref, action) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev.slice(-6), { id, ref, action }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }

  const manuel = (ref, field) => (manuels[ref] || {})[field] || ''
  const setManuel = useCallback((ref, field, v) =>
    setManuels(m => ({ ...m, [ref]: { ...(m[ref] || {}), [field]: v } })), [])
  const toggleJaune = useCallback((ref) =>
    setJaunes(m => ({ ...m, [ref]: !m[ref] })), [])

  const savedEco = (ref) => {
    const v = (saved[ref] || {}).eco
    const n = parseFloat(v)
    return !isNaN(n) ? n : null
  }

  const savedFrais = (ref) => {
    const v = (saved[ref] || {}).frais
    const n = parseFloat(v)
    return !isNaN(n) ? n : null
  }

  const conc1Excel = (ref) => {
    const p = refsExcelMap.get(norm(ref))
    if (!p) return ''
    const v = val(p, ['conc1'])
    return v != null ? String(v).trim() : ''
  }

  /** Conc 1 volontairement abandonné : le prix concurrent scrapé ne doit pas réapparaître. */
  const conc1Efface = (ref) => {
    const m = manuel(ref, 'conc1')
    if (m === EFFACE) return true
    if (String(m || '').trim() !== '') return false
    return (saved[ref] || {}).conc === null
  }

  const conc1Texte = (ref) => {
    const m = manuel(ref, 'conc1')
    if (m === EFFACE) return ''
    if (String(m || '').trim() !== '') return m
    const s = (saved[ref] || {}).conc
    if (s === null) return ''
    if (String(s || '').trim() !== '') return String(s)
    const ex = conc1Excel(ref)
    if (ex !== '') return ex
    const c1 = conc1Map[ref]
    return c1 && c1.prix != null ? `${c1.prix}${c1.vendeur ? ' ' + c1.vendeur : ''}` : ''
  }

  const titreConc = (ref) => {
    const parts = []
    if (conc1Efface(ref)) {
      parts.push('Prix concurrent abandonné — le résultat scrapé est ignoré')
      const c1 = conc1Map[ref]
      if (c1 && c1.prix != null) {
        parts.push(`Scrapé ignoré : ${c1.prix}${c1.vendeur ? ' ' + c1.vendeur : ''}`)
      }
      parts.push('Saisir une valeur pour rétablir le prix concurrent')
    } else {
      parts.push('Prix + marchand — modifiable')
      const c1 = conc1Map[ref]
      if (c1) {
        if (c1.nom) parts.push(c1.nom)
        if (c1.url) parts.push(c1.url)
      }
    }
    return parts.join('\n')
  }

  const refsExcelMap = useMemo(() => {
    const m = new Map()
    for (const p of produits) {
      const ref = val(p, ['reference', 'ref', 'sku', 'article'])
      if (ref) m.set(norm(ref), p)
    }
    return m
  }, [produits])

  const refsDispo = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const p of produits) {
      const ref = val(p, ['reference', 'ref', 'sku', 'article'])
      if (!ref || String(ref).trim() === '' || String(ref) === '—' || String(ref) === '-') continue
      const k = norm(ref)
      if (seen.has(k)) continue
      seen.add(k)
      out.push({
        ref: String(ref),
        nom: String(val(p, ['designation', 'désignation', 'nom', 'name', 'libellé']) || '').trim(),
        mini: num(val(p, ['mini', 'prix mini'])),
      })
    }
    return out
  }, [produits])

  const refsDoneSet = useMemo(() => new Set(doneRefs), [doneRefs])

  const refsVisibles = useMemo(() => {
    if (!masquerTraitees) return refsDispo
    return refsDispo.filter(r => !refsDoneSet.has(r.ref))
  }, [refsDispo, masquerTraitees, refsDoneSet])

  const nbMasquees = refsDispo.length - refsVisibles.length

  const refsFiltres = useMemo(() => {
    const f = norm(filtre)
    if (!f) return refsVisibles
    return refsVisibles.filter(r => norm(r.ref).includes(f) || norm(r.nom).includes(f))
  }, [refsVisibles, filtre])

  const references = [...refsSel]

  const chargerProduits = useCallback(() => {
    axios.get('/api/excel/produits').then(r => {
      const prods = r.data.produits || []
      setProduits(prods)
      const seen = new Set()
      const all = []
      for (const p of prods) {
        const ref = val(p, ['reference', 'ref', 'sku', 'article'])
        if (!ref || String(ref).trim() === '' || String(ref) === '—' || String(ref) === '-') continue
        const k = norm(ref)
        if (seen.has(k)) continue
        seen.add(k)
        all.push(String(ref))
      }
      setRefsSel(restoredSelRef.current ? (() => { const s = restoredSelRef.current; restoredSelRef.current = null; return s })() : all)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    chargerProduits()
  }, [chargerProduits])

  // Actions déjà appliquées (maj / marquage rouge) : le serveur les renvoie
  // aussi dans refs[], ce localStorage ne sert que de filet si le snapshot
  // serveur a été écrit avant cette version.
  const refsActionsMemo = useMemo(() => {
    const out = {}
    for (const [ref, info] of Object.entries(refsInfo || {})) {
      if (info && (info.maj || info.supprime)) {
        out[ref] = { maj: !!info.maj, supprime: !!info.supprime }
      }
    }
    return out
  }, [refsInfo])

  // ── Persistance de session (résultats conservés au changement de menu) ──
  const enregistrerSession = useCallback(() => {
    if (!jobId) return
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        jobId, status, fait, total, current, elapsed, jobMsg,
        refsSel, sitesActifs, filtre, manuels, saved, jaunes,
        refsActions: refsActionsMemo, savedAt: Date.now(),
      }))
    } catch { /* stockage local indisponible */ }
  }, [jobId, status, fait, total, current, elapsed, jobMsg, refsSel, sitesActifs, filtre, manuels, saved, jaunes, refsActionsMemo])

  // La session est re-serialisee a chaque frappe dans le champ frais (car
  // `manuels` est dans les dependances de `enregistrerSession`). localStorage
  // etant synchrone et bloquant, on regroupe les ecritures : sans cela chaque
  // saisie fige l'interface le temps du JSON.stringify + de l'ecriture disque.
  const writeSessionTimer = useRef(null)
  useEffect(() => {
    if (writeSessionTimer.current) clearTimeout(writeSessionTimer.current)
    writeSessionTimer.current = setTimeout(() => {
      writeSessionTimer.current = null
      enregistrerSession()
    }, 800)
  }, [enregistrerSession])

  useEffect(() => {
    let annule = false
    let essais = 0
    let timerRestore = null

    const restaurer = (jobId, local) => {
      if (local && Array.isArray(local.refsSel)) restoredSelRef.current = local.refsSel

      const recupererStatut = () => {
        axios.get(`/api/multi-scraper/statut/${jobId}`)
          .then(r => {
            const d = r.data
            if (local?.filtre) setFiltre(local.filtre)
            if (local?.manuels) setManuels(local.manuels)
            if (local?.saved) setSaved(local.saved)
            if (local?.jaunes) setJaunes(local.jaunes)
            if (local?.sitesActifs) setSitesActifs(local.sitesActifs)
            setSessionExiste(true)
            setJobId(jobId)
            setStatus(d.status || 'idle')
            setFait(d.fait ?? 0)
            setTotal(d.total ?? 0)
            setCurrent(d.current)
            setResults(d.results || {})
            setConc1Map(d.conc1 || {})
            setDispoMap(d.dispo || {})
            const nd = d.done_refs || []
            setDoneRefs(nd)
            if (nd.length) {
              const ndSet = new Set(nd)
              setRefsSel(prev => {
                const n = prev.filter(x => !ndSet.has(x))
                return n.length === prev.length ? prev : n
              })
            }
// Le serveur fait foi (snapshots écrits par cette version) ; le localStorage
            // ne complète que les références absentes des snapshots plus anciens.
            setRefsInfo(() => {
              const base = { ...(d.refs || {}) }
              for (const [ref, act] of Object.entries(local?.refsActions || {})) {
                base[ref] = { ...(base[ref] || {}), ...act }
              }
              return base
            })
            if (d.message) setJobMsg(d.message)
            if (d.duree != null) setElapsed(d.duree)
            if (d.status === 'running' && d.duree != null) {
              startedAt.current = Date.now() - d.duree * 1000
            }
          })
          .catch(err => {
            if (err.response && err.response.status === 404) {
              try { localStorage.removeItem(SESSION_KEY) }
              catch { /* stockage local indisponible */ }
              setSessionExiste(false)
              return
            }
            if (essais < 8) {
              essais++
              timerRestore = setTimeout(recupererStatut, 4000)
            } else {
              setJobMsg('Serveur injoignable — recharger la page pour réessayer la synchronisation')
            }
          })
      }
      recupererStatut()
    }

    // Le localStorage est cloisonné par origine : sur un autre domaine
    // (ex. *.onrender.com) il peut contenir un job bien plus ancien que celui
    // que le serveur considère comme le dernier. Le serveur fait foi.
    const demarrer = async () => {
      let local
      try { local = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') }
      catch { local = null }

      let cible = local?.jobId || null
      try {
        const r = await axios.get('/api/multi-scraper/dernier')
        const d = r.data || {}
        if (d.job_id && d.job_id !== cible) {
          cible = d.job_id
          local = null   // l'état UI local ne correspond plus à ce job
        }
      } catch { /* endpoint indisponible : on conserve le cache local */ }

      if (annule || !cible) return
      restaurer(cible, cible === local?.jobId ? local : null)
    }

    demarrer()
    return () => {
      annule = true
      if (timerRestore) clearTimeout(timerRestore)
    }
  }, [])

  useEffect(() => {
    if (!jobId || status !== 'running') return
    const timer = setInterval(async () => {
      try {
        const r = await axios.get(`/api/multi-scraper/statut/${jobId}`)
        const d = r.data
        setFait(d.fait ?? 0)
        setTotal(d.total ?? 0)
        setCurrent(d.current)
        setResults(d.results || {})
        setConc1Map(d.conc1 || {})
        setDispoMap(d.dispo || {})
        const nd = d.done_refs || []
        setDoneRefs(nd)
        if (nd.length) {
          const ndSet = new Set(nd)
          setRefsSel(prev => {
            const n = prev.filter(r => !ndSet.has(r))
            return n.length === prev.length ? prev : n
          })
        }
        setRefsInfo(d.refs || {})
        if (d.status === 'done' || d.status === 'error' || d.status === 'stopped') {
          setStatus(d.status)
          if (d.duree != null) setElapsed(d.duree)
          else if (startedAt.current) setElapsed(Math.round((Date.now() - startedAt.current) / 1000))
          if (d.message) setJobMsg(d.message)
        }
      } catch {
        setJobMsg(prev => prev === '' ? 'Synchronisation interrompue — nouvelle tentative en cours…' : prev)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [jobId, status])

  useEffect(() => {
    if (status !== 'running') return
    const t = setInterval(() => {
      if (startedAt.current) setElapsed(Math.round((Date.now() - startedAt.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [status])

  const lancer = async () => {
    if (status === 'running' || references.length === 0) return
    const sites = SITES.filter(s => sitesActifs[s])
    setMsg(null); setJobMsg(''); setResults({}); setRefsInfo({})
    setConc1Map({}); setDispoMap({}); setDoneRefs([])
    setFait(0); setTotal(references.length); setCurrent(null)
    setStatus('running')
    startedAt.current = Date.now()
    setElapsed(0)
    try {
      const r = await axios.post('/api/multi-scraper/lancer', { references, sites })
      setJobId(r.data.job_id)
    } catch (e) {
      setStatus('error')
      setMsg({ type: 'err', texte: e.response?.data?.erreur || "Impossible de lancer la recherche" })
    }
  }

  const arreter = async () => {
    if (!jobId) return
    try {
      await axios.post(`/api/multi-scraper/arreter/${jobId}`)
      if (startedAt.current) setElapsed(Math.round((Date.now() - startedAt.current) / 1000))
      setJobMsg('Arrêt demandé — fin de la recherche en cours…')
    } catch (e) {
      setMsg({ type: 'err', texte: e.response?.data?.erreur || "Impossible d'arrêter la recherche" })
    }
  }

  const reinitialiser = () => {
    setJobId(null); setStatus('idle'); setFait(0); setTotal(0)
    setCurrent(null); setResults({}); setRefsInfo({}); setJobMsg('')
    setConc1Map({}); setDispoMap({}); setDoneRefs([]); setElapsed(0)
    setSaved({}); setJaunes({}); setSessionExiste(false)
    try { localStorage.removeItem(SESSION_KEY) } catch { /* stockage local indisponible */ }
  }

  const effacerSession = () => {
    reinitialiser()
  }

  const toggleRef = (ref) => {
    setRefsSel(prev => prev.includes(ref) ? prev.filter(x => x !== ref) : [...prev, ref])
  }

  const toutSelectionner = () => setRefsSel(refsVisibles.map(r => r.ref))
  const toutDeselectionner = () => setRefsSel([])
  const selectionnerFiltre = () => {
    setRefsSel(prev => {
      const set = new Set(prev)
      refsFiltres.forEach(r => set.add(r.ref))
      return [...set]
    })
  }

  /** Prix effectif d'un site. Un prix effacé (produit retiré du site) ne retombe jamais sur le scrape. */
  const prixSite = (ref, site) => {
    const m = manuel(ref, 'prix_' + site)
    if (m === EFFACE) return null
    const t = String(m || '').trim()
    if (t !== '') {
      const n = parseFloat(t.replace(',', '.'))
      if (!isNaN(n)) return n
    }
    const sv = saved[ref]?.prix
    if (sv && Object.prototype.hasOwnProperty.call(sv, site)) {
      if (sv[site] === null) return null
      const n = parseFloat(sv[site])
      if (!isNaN(n)) return n
    }
    const r = (results[ref] || {})[site]
    if (r && !r.introuvable && r.prix != null) {
      const n = parseFloat(r.prix)
      if (!isNaN(n)) return n
    }
    return null
  }

  /** Le prix de ce site a été effacé volontairement (saisie en cours ou dernier apply). */
  const prixSiteEfface = (ref, site) => {
    const m = manuel(ref, 'prix_' + site)
    if (m === EFFACE) return true
    if (String(m || '').trim() !== '') return false
    return saved[ref]?.prix?.[site] === null
  }

  const prixSiteCorrige = (ref, site) => {
    const m = manuel(ref, 'prix_' + site)
    return m !== EFFACE && String(m || '').trim() !== ''
  }

  /** Contenu affiché dans le champ : saisie brute, sinon prix effectif formaté. */
  const saisiePrix = (ref, site) => {
    const m = manuel(ref, 'prix_' + site)
    if (m === EFFACE) return ''
    if (String(m || '').trim() !== '') return String(m)
    const v = prixSite(ref, site)
    return v != null ? v.toFixed(2) : ''
  }

  /** Champs a effacement possible (prix sites, conc1) : vide = abandonner la valeur scrapee. */
  const setSaisie = useCallback((ref, field, txt) => {
    const t = String(txt ?? '').trim()
    setManuels(m => ({ ...m, [ref]: { ...(m[ref] || {}), [field]: t === '' ? EFFACE : t } }))
  }, [])

  const titreSite = (ref, site, v, corrige, efface) => {
    const r = (results[ref] || {})[site] || {}
    const parts = []
    if (efface) {
      parts.push('Prix effacé — produit considéré absent de ce site')
      if (r.prix != null) parts.push(`Prix scrapé ignoré : ${parseFloat(r.prix).toFixed(2)} €`)
      parts.push('Saisir une valeur pour rétablir le prix')
    } else if (corrige) {
      const s = parseFloat(String(manuel(ref, 'prix_' + site)).replace(',', '.'))
      if (!isNaN(s) && r.prix != null && Math.abs(s - parseFloat(r.prix)) > 0.001) {
        parts.push(`Prix scrapé : ${parseFloat(r.prix).toFixed(2)} €`)
      }
      parts.push('Corrigé manuellement')
      parts.push('Effacer le champ pour ignorer définitivement le prix scrapé')
    } else if (v == null) {
      parts.push(r.message || r.erreur || 'Introuvable au scrape — saisir un prix')
    } else {
      parts.push('Prix scrapé — modifiable')
    }
    if (r.nom) parts.push(r.nom)
    if (r.url) parts.push(r.url)
    return parts.join('\n')
  }

  const payloadSites = (ref) => {
    const sites = {}
    const enCours = status === 'running' || status === 'pending'
    for (const site of SITES) {
      const v = prixSite(ref, site)
      if (v != null) {
        sites[site] = { prix: v }
      } else if (!enCours) {
        sites[site] = { introuvable: true }
      }
    }
    return sites
  }

  const ecoPart = (ref) => {
    const r = (results[ref] || {}).cedi
    return r && typeof r.ecopart === 'number' ? r.ecopart : null
  }

  const ecoDe = (p) => {
    if (!p) return null
    const ttc = num(val(p, ['ep ttc', 'ecopart ttc', 'ecopartttc', 'eco part ttc', 'ep tva', 'ecopart tva']))
    if (ttc != null) return ttc
    const ht = num(val(p, ['eco_part', 'ecopart', 'eco-part', 'éco-part']))
    return ht != null ? Math.round(ht * 1.2 * 100) / 100 : null
  }

  /** Eco-part effective : saisie manuelle > site scrapé > Excel. */
  const ecoUtilise = (ref) => {
    const v = String((manuels[ref] || {}).eco || '').trim()
    if (v !== '') {
      const n = parseFloat(v)
      if (!isNaN(n)) return n
    }
    const sv = savedEco(ref)
    if (sv != null) return sv
    const site = ecoPart(ref)
    if (site != null) return site
    return ecoDe(refsExcelMap.get(norm(ref)))
  }

  const trouverPrix = (ref) =>
    SITES.some(s => prixSite(ref, s) != null) ||
    Object.entries(results[ref] || {}).some(([site, r]) =>
      !SITES.includes(site) && r && !r.introuvable && r.prix != null)


  const aManuels = (ref) => Object.values(manuels[ref] || {}).some(v => String(v || '').trim() !== '')
  const manuelsHorsConc = (ref) => {
    const m = manuels[ref] || {}
    return ['ean13', 'famille', 'sous_famille', 'nom'].some(k => String(m[k] || '').trim() !== '')
  }
  const viderManuels = (ref) => {
    setManuels(prev => {
      if (!prev[ref]) return prev
      const n = { ...prev }
      delete n[ref]
      return n
    })
  }
  const sansPrixSite = (ref) => !trouverPrix(ref)

  const ALT_EXCEL = { cedi: ['cedi'], findis: ['find', 'findis'], gpdis: ['gpdis'], sogam: ['sogam'] }

  const estAJour = (ref) => {
    if (refsInfo[ref] && !refsInfo[ref].dans_excel) return false
    const p = refsExcelMap.get(norm(ref))
    if (!p) return false
    for (const site of SITES) {
      const ev = num(val(p, ALT_EXCEL[site]))
      if (prixSiteEfface(ref, site)) {
        if (ev != null) return false
        continue
      }
      const sv = prixSite(ref, site)
      if (sv == null) continue
      if (ev == null) return false
      if (Math.abs(ev - sv) > 0.001) return false
    }
    // Comparer l'éco effective (saisie ou scrapée) à celle déjà en Excel
    const ecoS = ecoUtilise(ref)
    if (ecoS != null) {
      const ecoE = ecoDe(p)
      if (ecoE == null || Math.abs(ecoS - ecoE) > 0.001) return false
    }
    return true
  }

  const aActionner = (ref) => {
    // Une saisie manuelle (dont une correction du Conc 1) ressuscite une
    // référence marquée "Supprimé" : sans cela le verrou est définitif et
    // l'utilisateur n'a plus aucun moyen de la faire revenir.
    const manuel = aManuels(ref)
    if (refsInfo[ref]?.supprime && !manuel) return false
    if (refsInfo[ref] && !refsInfo[ref].dans_excel) return trouverPrix(ref) || manuel
    if (!manuel && aSupprimer(ref)) return false
    // Déjà marqué à jour : ne réafficher le bouton que si l'utilisateur a re-saisi un champ
    if (refsInfo[ref]?.maj && !manuel) return false
    return !estAJour(ref) || manuel
  }

  /** Prix retenus pour l'affichage local apres application (null si introuvable). */
  const prixAppliquePour = (ref, sites) => {
    const out = {}
    for (const site of SITES) {
      if (!sites[site]) continue
      out[site] = sites[site].introuvable ? null : sites[site].prix
    }
    return out
  }

  /**
   * Construit le payload d'une reference a partir de l'etat de l'interface.
   * Renvoie null quand il n'y a rien a ecrire (evite un POST inutile).
   * Partage par `appliquer` (bouton d'une ligne) et `appliquerTout` (lot) pour
   * garantir que le lot applique exactement la meme chose que le bouton.
   */
  const payloadPour = (ref) => {
    const sites = payloadSites(ref)
    const m = manuels[ref] || {}
    const conc1Auto = conc1Map[ref]?.prix ?? null
    const conc1Manuel = (m.conc1 || '').trim()
    const concEfface = conc1Efface(ref)
    const concApplied = conc1Texte(ref)
    const ecoVal = ecoUtilise(ref)
    if (Object.keys(sites).length === 0 && !aManuels(ref) && conc1Auto == null && !conc1Manuel && ecoVal == null) return null
    const base = {
      reference: ref,
      job_id: jobId,
      nom: (m.nom || '').trim() || (results[ref] || {}).cedi?.nom || '',
      sites,
      disponibilite: dispoMap[ref] || undefined,
      conc1: concEfface ? CONC1_ABSENT : (concApplied !== '' ? concApplied : undefined),
      ean13: (m.ean13 || '').trim() || undefined,
      famille: (m.famille || '').trim() || undefined,
      sous_famille: (m.sous_famille || '').trim() || undefined,
    }
    const fraisVal = (m.frais || '').trim()
    const fraisNum = fraisVal !== '' && !isNaN(parseFloat(fraisVal)) ? parseFloat(fraisVal) : null
    if (fraisNum != null) base.frais = fraisNum
    if (ecoVal != null) base.eco_part = ecoVal
    return { base, sites, fraisNum, ecoVal, concEfface, concApplied }
  }

  /** Reporte dans l'etat local le resultat d'une reference. */
  const appliquerResultat = (ref, dataMaj, ctx, silencieux) => {
    const { sites, fraisNum, ecoVal, concEfface, concApplied } = ctx
    if (refsInfo[ref]?.dans_excel) {
      // Succes HTTP : toujours marquer a jour (meme si mis_a_jour === 0)
      setProduits(prev => prev.map(p => {
        const refKey = val(p, ['reference', 'ref', 'sku', 'article'])
        if (norm(refKey) !== norm(ref)) return p
        const maj = dataMaj.updated || {}
        let upd = { ...p }
        for (const site of SITES) {
          const nv = num(maj[site])
          if (nv != null) upd = setCle(upd, SITE_EXCEL_KEY[site], nv)
          else if (sites[site] && sites[site].introuvable) upd = setCle(upd, SITE_EXCEL_KEY[site], null)
        }
        const np = num(dataMaj.eco_part != null ? dataMaj.eco_part : ecoVal)
        if (np != null) upd = setCle(upd, 'EP TTC', np)
        if (concEfface) upd = setCle(upd, 'CONC1', CONC1_ABSENT)
        else if (concApplied !== '') upd = setCle(upd, 'CONC1', concApplied)
        if (fraisNum != null) upd = setCle(upd, 'Frais', fraisNum)
        return upd
      }))
      setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), maj: true, dans_excel: true, supprime: false } }))
      setSaved(prev => ({
        ...prev,
        [ref]: {
          conc: concEfface ? null : concApplied,
          eco: ecoVal != null ? ecoVal : (prev[ref]?.eco ?? null),
          frais: fraisNum != null ? fraisNum : (prev[ref]?.frais ?? null),
          prix: prixAppliquePour(ref, sites),
        },
      }))
      viderManuels(ref)
      if (!silencieux) pushToast(ref, 'mis à jour')
    } else if (dataMaj.ajout > 0) {
      setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), dans_excel: true, maj: true, supprime: false } }))
      setSaved(prev => ({
        ...prev,
        [ref]: {
          conc: concEfface ? null : concApplied,
          eco: ecoVal != null ? ecoVal : (prev[ref]?.eco ?? null),
          frais: fraisNum != null ? fraisNum : (prev[ref]?.frais ?? null),
          prix: prixAppliquePour(ref, sites),
        },
      }))
      viderManuels(ref)
      if (!silencieux) pushToast(ref, 'ajouté')
    }
  }

  const appliquer = async (ref, silencieux = false) => {
    const ctx = payloadPour(ref)
    if (!ctx) return
    if (!silencieux) setBusyRefs(prev => ({ ...prev, [ref]: true }))
    try {
      const r = refsInfo[ref]?.dans_excel
        ? await axios.post('/api/multi-scraper/mettre-a-jour', ctx.base)
        : await axios.post('/api/multi-scraper/ajouter', ctx.base)
      appliquerResultat(ref, r.data || {}, ctx, silencieux)
      if (!silencieux) setMsg({ type: 'ok', texte: r.data.message })
      return r.data
    } catch (e) {
      if (!silencieux) setMsg({ type: 'err', texte: e.response?.data?.erreur || "Erreur lors de l'application" })
    } finally {
      if (!silencieux) setBusyRefs(prev => { const n = { ...prev }; delete n[ref]; return n })
    }
  }


  /**
   * Applique TOUTES les references en attente.
   *
   * Avant : une requete par reference, jusqu'a 6 en parallele, chacune
   * relisant ET reecrivant le classeur entier sous un verrou mono-fichier.
   * Resultat : saturation du verrou (500 "Fichier Excel occupe"), descripteurs
   * epuises, et surtout des `catch {}` VIDES qui avalaient chaque echec : le
   * badge restait indefiniment "a mettre a jour" sans aucun message.
   *
   * Maintenant : une requete par categorie (maj / ajout / marquage rouge), avec
   * un seul verrou et un seul rechargement du classeur, et un rapport par
   * reference. Plus rien n'est perdu en silence.
   */
  const appliquerTout = async () => {
    setBusy(true)
    const aSuppr = [], aMaj = [], aAjout = []
    for (const ref of Object.keys(results)) {
      if (aSupprimer(ref)) aSuppr.push(ref)
      else if (aActionner(ref)) (refsInfo[ref]?.dans_excel ? aMaj : aAjout).push(ref)
    }

    const echecs = []
    let maj = 0, ajout = 0, sup = 0

    // 1) Marquage "supprime" : un seul lot, un seul rechargement du classeur.
    if (aSuppr.length) {
      try {
        const r = await axios.post('/api/multi-scraper/supprimer-reference-lot', {
          items: aSuppr.map(reference => ({ reference, job_id: jobId })),
        })
        const d = r.data || {}
        sup = (d.marquees || 0) + (d.deja_absentes || 0)
        for (const ref of Object.keys(d.resultats || {})) {
          setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), supprime: true } }))
        }
        for (const e of (d.echecs || [])) echecs.push({ ...e, operation: 'marquage rouge' })
      } catch (e) {
        echecs.push({
          reference: null, operation: 'marquage rouge',
          message: e.response?.data?.erreur || e.message || 'Erreur réseau',
        })
      }
    }

    // 2) References deja dans l'Excel : un seul POST /mettre-a-jour-lot.
    if (aMaj.length) {
      const ctxs = []
      const items = []
      for (const ref of aMaj) {
        const ctx = payloadPour(ref)
        if (!ctx) continue
        ctxs.push([ref, ctx])
        items.push(ctx.base)
      }
      if (items.length) {
        try {
          const r = await axios.post('/api/multi-scraper/mettre-a-jour-lot', { items })
          const d = r.data || {}
          const resultats = d.resultats || {}
          for (const [ref, ctx] of ctxs) {
            if (resultats[ref]) {
              maj++
              appliquerResultat(ref, resultats[ref], ctx, true)
            }
          }
          for (const e of (d.echecs || [])) echecs.push({ ...e, operation: 'mise à jour' })
        } catch (e) {
          echecs.push({
            reference: null, operation: 'mise à jour',
            message: e.response?.data?.erreur || e.message || 'Erreur réseau',
          })
        }
      }
    }

    // 3) References absentes du classeur : l'ajout cree une ligne, il n'existe
    //    pas de route "lot" equivalente car l'ecriture depend de la structure
    //    du fichier. Ces references sont rares et treatmentes une par une.
    for (const ref of aAjout) {
      const ctx = payloadPour(ref)
      if (!ctx) continue
      try {
        const r = await axios.post('/api/multi-scraper/ajouter', ctx.base)
        if ((r.data || {}).ajout > 0) {
          ajout++
          appliquerResultat(ref, r.data, ctx, true)
        }
      } catch (e) {
        echecs.push({
          reference: ref, operation: 'ajout',
          message: e.response?.data?.erreur || e.message || 'Erreur réseau',
        })
      }
    }

    setBusy(false)
    chargerProduits()

    const morceaux = []
    if (maj) morceaux.push(`${maj} mis à jour`)
    if (ajout) morceaux.push(`${ajout} ajouté(s)`)
    if (sup) morceaux.push(`${sup} marqué(s) en rouge`)

    if (echecs.length) {
      // Les references absentes du classeur ne sont pas des pannes : elles
      // n'existent tout simplement pas encore et doivent etre ajoutees.
      const aCreer = echecs.filter(e => e.code === 404)
      const vraies = echecs.filter(e => e.code !== 404)
      const details = [
        ...vraies.slice(0, 5).map(e => `${e.reference || 'lot'} : ${e.message}`),
        ...(vraies.length > 5 ? [`… +${vraies.length - 5} autre(s)`] : []),
        ...aCreer.slice(0, 3).map(e => `${e.reference} : absent du classeur (à ajouter)`),
        ...(aCreer.length > 3 ? [`… +${aCreer.length - 3} autre(s) absente(s)`] : []),
      ]
      setMsg({
        type: 'err',
        texte: `${morceaux.length ? morceaux.join(', ') + ' — ' : ''}${echecs.length} échec(s) : ${details.join(' | ')}`,
      })
    } else {
      setMsg({ type: 'ok', texte: morceaux.length ? `${morceaux.join(', ')} dans l'Excel` : "Rien à appliquer" })
    }
  }

  const dispoSite = (ref, site) => dispoMap[ref]?.[site] || results[ref]?.[site]?.disponibilite

  const dispoClasse = (d) => {
    const t = String(d || '').toLowerCase()
    if (!t || t === '—') return 'dispoNeutre'
    if (t.includes('indispon') || t.includes('rupture') || t.includes('épuis') ||
        t.includes('epuis') || t.includes('arrêt') || t.includes('arrete')) return 'dispoKo'
    if (t.includes('stock') || t.includes('dispon')) return 'dispoOk'
    if (t.includes('commande') || t.includes('retour')) return 'dispoWait'
    return 'dispoNeutre'
  }

  const fmtDuree = (s) => {
    if (!isFinite(s) || s < 0) s = 0
    s = Math.round(s)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
    return `${m} min ${String(sec).padStart(2, '0')} s`
  }

  const detecterFrais = (nom) => {
    const n = (nom || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const TRES_GRANDS = ['REFRIGERATEUR', 'CONGELATEUR', 'CAVE A VIN', 'CAVE-A-VIN', 'CAVE A BIERE', 'AMERICAIN', 'CONGELATEUR COFFRE', 'CONGELATEUR VERTICAL', 'ARM']
    const GRANDS = ['LAVE LINGE', 'LAVE-LINGE', 'SECHE LINGE', 'SECHE-LINGE', 'LAVE VAISSELLE', 'LAVE-VAISSELLE', 'CUISINIERE', 'CUISIERE', 'PIANO DE CUISSON', 'PIANO-DE-CUISSON', 'FOUR', 'FOURS', 'HOTTE', 'TABLE DE CUISSON', 'PLAQUE DE CUISSON', 'PLAN DE CUISSON']
    const MOYENS = ['MICRO ONDES', 'MICRO-ONDES', 'PETIT MENAGER', 'CAFE', 'CAFETIERE']
    if (TRES_GRANDS.some(g => n.includes(g))) return 80
    if (GRANDS.some(g => n.includes(g))) return 75
    if (MOYENS.some(g => n.includes(g))) return 60
    return 50
  }

  const trancheFrais = (p) => {
    const f = [val(p, 'grande_famille'), val(p, 'famille'), val(p, 'sous_famille')]
      .filter(x => x && String(x).trim())
      .map(x => String(x).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
      .join(' ')
    const TRES_GRANDS = ['REFRIGERATEUR', 'CONGELATEUR', 'CAVE A VIN', 'CAVE-A-VIN', 'CAVE A BIERE', 'AMERICAIN', 'CONGELATEUR COFFRE', 'CONGELATEUR VERTICAL', 'ARM']
    const GRANDS = ['LAVE LINGE', 'LAVE-LINGE', 'SECHE LINGE', 'SECHE-LINGE', 'LAVE VAISSELLE', 'LAVE-VAISSELLE', 'CUISINIERE', 'CUISIERE', 'PIANO DE CUISSON', 'PIANO-DE-CUISSON', 'FOUR', 'FOURS', 'HOTTE', 'TABLE DE CUISSON', 'PLAQUE DE CUISSON', 'PLAN DE CUISSON']
    const MOYENS = ['MICRO ONDES', 'MICRO-ONDES', 'PETIT MENAGER', 'CAFE', 'CAFETIERE']
    if (TRES_GRANDS.some(g => f.includes(g))) return 80
    if (GRANDS.some(g => f.includes(g))) return 75
    if (MOYENS.some(g => f.includes(g))) return 60
    return 50
  }

  const fraisDe = (ref, nom) => {
    const m = manuels[ref] || {}
    const v = String(m.frais || '').trim()
    if (v !== '') {
      const n = parseFloat(v)
      if (!isNaN(n)) return n
    }
    const sv = savedFrais(ref)
    if (sv != null) return sv
    const p = refsExcelMap.get(norm(ref))
    if (p) {
      const f = val(p, ['frais'])
      if (f != null) {
        const n = parseFloat(String(f).replace(',', '.'))
        if (!isNaN(n)) return n
      }
      const t = trancheFrais(p)
      if (t != null) return t
    }
    return detecterFrais(nom)
  }

  const excelPrix = (p) => {
    if (!p) return []
    const out = []
    for (const site of SITES) {
      const v = num(val(p, SITE_EXCEL_KEY[site]))
      if (v != null) out.push({ site, v })
    }
    return out
  }

  const prixMinDe = (ref) => {
    const vals = []
    for (const [site, r] of Object.entries(results[ref] || {})) {
      if (SITES.includes(site)) {
        const v = prixSite(ref, site)
        if (v != null) vals.push(v)
        continue
      }
      if (r && !r.introuvable && r.prix != null) {
        const v = parseFloat(r.prix)
        if (!isNaN(v)) vals.push(v)
      }
    }
    return vals.length ? Math.min(...vals) : null
  }

  const conc1PrixDe = (ref) => {
    if (conc1Efface(ref)) return null
    const t = conc1Texte(ref)
    if (t === '') return null
    const n = prixDepuisTexte(t)
    return n != null && !isNaN(n) ? n : null
  }

  const miniCalculePour = (ref) => {
    const minAll = prixMinDe(ref)
    if (minAll == null) return 0
    const p = refsExcelMap.get(norm(ref))
    const nom = (results[ref]?.cedi?.nom || (p ? String(val(p, ['designation', 'désignation', 'nom', 'name']) || '') : '')) || ''
    const frais = fraisDe(ref, nom)
    const eco = ecoUtilise(ref)
    const ecoN = eco != null && !isNaN(parseFloat(eco)) ? parseFloat(eco) : 0
    return Math.round((minAll + frais + ecoN) * 1.2 / 0.98 * 100) / 100
  }

  /** À supprimer si : aucun prix site, OU mini > Conc 1 (marquage rouge Excel, pas suppression de ligne). */
  const aSupprimer = (ref) => {
    if (status === 'running' || !refsDoneSet.has(ref)) return false
    if (!refsInfo[ref]?.dans_excel || refsInfo[ref]?.supprime) return false
    if (sansPrixSite(ref)) return true
    const mini = miniCalculePour(ref)
    const conc1 = conc1PrixDe(ref)
    return mini != null && conc1 != null && mini > conc1
  }

  const refsAffichees = Object.keys(refsInfo).filter(ref => results[ref])
  const pct = total > 0 ? Math.round((fait / total) * 100) : 0

  // ── Suppression automatique ────────────────────────────────────────────
  // Une référence à supprimer (aucun prix site, ou mini > Conc 1) est marquée
  // en rouge sans intervention : il n'y a rien à arbitrer, l'action est
  // toujours la même. Seul "mettre à jour" reste manuel.
  // aSupprimer et refsAffichees sont recréés à chaque render : on les lit via
  // un ref pour que l'effet ne se redéclenche pas indéfiniment.
  const aSupprimerRef = useRef(aSupprimer)
  const refsAfficheesRef = useRef(refsAffichees)
  useEffect(() => {
    aSupprimerRef.current = aSupprimer
    refsAfficheesRef.current = refsAffichees
  })

  const autoTraiteRef = useRef({})
  useEffect(() => {
    if (status !== 'done' && status !== 'stopped') return
    if (!jobId) return
    if (autoTraiteRef.current.jobId !== jobId) autoTraiteRef.current = { jobId, refs: new Set() }
    const dejaTraites = autoTraiteRef.current.refs
    const testSuppr = aSupprimerRef.current
    const cibles = refsAfficheesRef.current.filter(ref => testSuppr(ref) && !dejaTraites.has(ref))
    if (!cibles.length) return
    cibles.forEach(ref => dejaTraites.add(ref))
    let annule = false
    ;(async () => {
      try {
        // Un seul lot : un seul rechargement du classeur au lieu d'un par
        // reference. Les references absentes du classeur ne sont plus une
        // erreur 404 (voir route supprimer-reference) : elles sont comptees
        // comme deja absentes, donc l'action ne sera plus proposee.
        const r = await axios.post('/api/multi-scraper/supprimer-reference-lot', {
          items: cibles.map(reference => ({ reference, job_id: jobId })),
        })
        if (annule) return
        const d = r.data || {}
        const marquees = (d.marquees || 0) + (d.deja_absentes || 0)
        for (const ref of Object.keys(d.resultats || {})) {
          setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), supprime: true } }))
          viderManuels(ref)
        }
        if (!marquees) return
        const echecs = d.echecs || []
        setMsg(echecs.length
          ? { type: 'err', texte: `${marquees} référence(s) marquée(s) en rouge, ${echecs.length} en échec` }
          : { type: 'ok', texte: `${marquees} référence(s) marquée(s) en rouge automatiquement` })
        chargerProduits()
      } catch (e) {
        if (annule) return
        setMsg({ type: 'err', texte: e.response?.data?.erreur || 'Échec du marquage automatique' })
      }
    })()
    return () => { annule = true }
  }, [status, jobId, chargerProduits])

  // ── Réconciliation des tâches déjà faites avant cette version ──────────
  // Reconstruit maj/supprime depuis l'Excel réel : ni réécriture du fichier,
  // ni nouveau scraping, uniquement la relecture des prix et des polices.
  const [reconcilie, setReconcilie] = useState(false)
  const reconcilier = async () => {
    if (!jobId) return
    setBusy(true)
    try {
      const r = await axios.post('/api/multi-scraper/reconcilier', { job_id: jobId })
      const d = r.data || {}
      if (d.refs) setRefsInfo(d.refs)
      setMsg({ type: 'ok', texte: d.message || 'Réconciliation terminée' })
      setReconcilie(true)
      chargerProduits()
    } catch (e) {
      setMsg({ type: 'err', texte: e.response?.data?.erreur || 'Réconciliation impossible' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${styles.page}${pleinEcran ? ' ' + styles.pleinEcran : ''}`}>
      <div className={styles.header}>
        <NotebookPen size={22} />
        <div>
          <h1>Scrap multi-sites</h1>
          <p>Recherche des références du fichier sur CEDI, FINDIS, GPDIS et SOGAM — prix d'achat HT</p>
        </div>
      </div>

      {msg && (
        <div className={`${styles.msg} ${styles['msg_' + msg.type]}`}>
          <span>{msg.texte}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {toasts.length > 0 && (
        <div className={styles.toasts}>
          {toasts.map(t => (
            <div key={t.id} className={styles.toast}>
              <CheckCircle2 size={14} />
              <b>{t.ref}</b>
              <span>{t.action}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.refsHeader}>
          <label className={styles.label}>Références (auto-chargées depuis le fichier Excel)</label>
          <div className={styles.refsHeaderRight}>
            <label className={styles.masquerLabel} title="Masquer les références dont le scan est terminé (traitement effectué)">
              <input
                type="checkbox"
                checked={masquerTraitees}
                onChange={e => setMasquerTraitees(e.target.checked)}
              />
              Masquer les traitées
            </label>
            {nbMasquees > 0 && <span className={styles.masqueBadge}>{nbMasquees} masquée(s)</span>}
            <span className={styles.refsCount} title={`${references.length} / ${refsDispo.length} références disponibles`}>
              {references.length} / {refsVisibles.length} sélectionnée(s)
            </span>
          </div>
        </div>
        <div className={styles.filtreRow}>
          <Search size={14} className={styles.filtreIcon} />
          <input
            className={styles.filtreInput}
            placeholder="Filtrer par référence ou nom…"
            value={filtre}
            onChange={e => setFiltre(e.target.value)}
          />
        </div>
        <div className={styles.listeRefs}>
          {refsFiltres.length === 0 ? (
            <div className={styles.emptyListe}>
              {masquerTraitees && nbMasquees === refsDispo.length
                ? 'Toutes les références sont marquées comme traitées'
                : 'Aucune référence dans le filtre'}
            </div>
          ) : (
            refsFiltres.map(r => (
              <label key={r.ref} className={styles.refRow}>
                <input
                  type="checkbox"
                  checked={refsSel.includes(r.ref)}
                  onChange={() => toggleRef(r.ref)}
                />
                <code className={styles.ref}>{r.ref}</code>
                {r.nom && <span className={styles.smallNom}>{r.nom}</span>}
                {r.mini != null && <span className={styles.miniExcel}>{r.mini.toFixed(2)} €</span>}
              </label>
            ))
          )}
        </div>
        <div className={styles.selBtns}>
          <button className={styles.iconBtn} onClick={toutSelectionner} disabled={busy}>
            <CheckSquare size={13} /> Tout sélectionner
          </button>
          <button className={styles.iconBtn} onClick={selectionnerFiltre} disabled={busy}>
            <ListFilter size={13} /> Sélectionner le filtre
          </button>
          <button className={styles.iconBtn} onClick={toutDeselectionner} disabled={busy}>
            <Square size={13} /> Tout désélectionner
          </button>
        </div>

        <div className={styles.sitesRow}>
          <span className={styles.label}>Sites :</span>
          {SITES.map(s => (
            <label key={s} className={styles.siteCheck}>
              <input
                type="checkbox"
                checked={!!sitesActifs[s]}
                onChange={e => setSitesActifs(a => ({ ...a, [s]: e.target.checked }))}
              />
              {SITE_LABEL[s]}
            </label>
          ))}
        </div>

        <div className={styles.actions}>
          <button
            className={styles.primaryBtn}
            onClick={lancer}
            disabled={status === 'running' || references.length === 0}
          >
            <Rocket size={15} />
            {status === 'running'
              ? 'Recherche en cours…'
              : `Lancer la recherche (${references.length})`}
          </button>
          {status !== 'done' && status !== 'error' && status !== 'stopped' && (
            <button className={styles.primaryBtn} onClick={reinitialiser} disabled={busy}>
              <RefreshCw size={14} /> Nouvelle recherche
            </button>
          )}
          {status === 'running' && (
            <button className={styles.stopBtn} onClick={arreter} disabled={busy}>
              <Square size={14} /> Arrêter
            </button>
          )}
          {sessionExiste && (
            <button className={styles.iconBtn} onClick={effacerSession} disabled={busy}
              title="Supprime le résultat affiché et la session enregistrée — tout repart à zéro">
              <Trash2 size={13} /> Supprimer le résultat
            </button>
          )}
        </div>
      </div>

      {(status === 'running' || (status !== 'idle' && total > 0)) && (
        <div className={styles.panel}>
          <div className={styles.progressHeader}>
            <span>
              {status === 'running'
                ? `Scan ${fait}/${total} — ${current ? `${current.ref} (${SITE_LABEL[current.site] || current.site})` : ''}`
                : `${fait}/${total} référence(s) analysée(s)`}
            </span>
            {status === 'running' && <span className={styles.live} title="Temps écoulé">⏱ {fmtDuree(elapsed)}</span>}
            {(status === 'done' || status === 'stopped' || status === 'error') && elapsed > 0 && (
              <span className={styles.dureeTotal} title="Durée totale">Durée : {fmtDuree(elapsed)}</span>
            )}
            {status === 'stopped' && <span className={styles.stopBadge}>arrêté</span>}
          </div>
          <ProgressBar value={pct} />
          {jobMsg && <div className={styles.jobMsg}>{jobMsg}</div>}
        </div>
      )}

      {(status === 'running' || status === 'done' || status === 'stopped') && refsAffichees.length > 0 && (
        <div className={styles.tableWrap}>
          <div className={styles.resultsToolbar}>
            <span className={styles.label}>
              {refsAffichees.length} résultat(s) —{' '}
              {doneRefs.length} traité(s) —{' '}
              {Object.entries(refsInfo).filter(([, v]) => !v.dans_excel).length} nouveau(x)
            </span>
            {refsAffichees.some(aActionner) && (
              <button className={styles.btnMajLot} onClick={appliquerTout} disabled={busy}>
                {busy ? <><Loader size={13} className={styles.spin}/> Application…</> : <><CheckCircle2 size={13}/> Appliquer tout</>}
              </button>
            )}
            {(status === 'done' || status === 'stopped') && !reconcilie && (
              <button
                className={styles.btnPlein}
                onClick={reconcilier}
                disabled={busy}
                title="Relire l'Excel pour marquer comme traitées les références déjà mises à jour ou colorées en rouge avant cette version — sans réécrire le fichier"
              >
                <RefreshCw size={13}/> Reconcilier
              </button>
            )}
            <button
              className={styles.btnPlein}
              onClick={() => setPleinEcran(v => !v)}
              title={pleinEcran ? 'Réduire les résultats' : 'Afficher le tableau en plein écran'}
            >
              {pleinEcran ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}
              {pleinEcran ? 'Réduire' : 'Plein écran'}
            </button>
          </div>

          <div className={styles.tableScroll}>
          <table className={styles.table}>
            <colgroup>
              <col className={styles.colMarque}/>
              <col className={styles.colNum}/>
              <col className={styles.colRef}/>
              <col className={styles.colEan}/>
              <col className={styles.colFamille}/>
              <col className={styles.colSousFamille}/>
              <col className={styles.colNom}/>
              <col className={styles.colPrixExcel}/>
              {SITES.map(s => <col key={s} className={styles.colPrixSite}/>)}
              <col className={styles.colConc}/>
              <col className={styles.colDispo}/>
              <col className={styles.colEco}/>
              <col className={styles.colFrais}/>
              <col className={styles.colMini}/>
              <col className={styles.colStatut}/>
              <col className={styles.colActions}/>
            </colgroup>
            <thead>
              <tr>
                <th className={styles.colMarque} title="Cocher pour marquer la ligne en vert (reste tant que non décochée)">✓</th>
                <th>#</th>
                <th>Réf.</th>
                <th>EAN13</th>
                <th>Famille</th>
                <th>Sous-famille</th>
                <th>Nom</th>
                <th>Prix Excel</th>
                {SITES.map(s => <th key={s}>{SITE_LABEL[s]}</th>)}
                <th>Conc 1</th>
                <th>Disponibilité</th>
                <th>Eco Part</th>
                <th>Frais</th>
                <th>Mini</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {refsAffichees.map((ref, i) => {
                const p = refsExcelMap.get(norm(ref))
                const intra = !trouverPrix(ref) && !manuelsHorsConc(ref)
                const estNouveau = refsInfo[ref] && !refsInfo[ref].dans_excel
                const prixExcel = excelPrix(p)
                const ecoExcel = p ? ecoDe(p) : null
                const nom = (results[ref]?.cedi?.nom || p ? String(val(p, ['designation', 'désignation', 'nom', 'name']) || '') : '') || ''
                const minAll = prixMinDe(ref)
                const fraisUsed = fraisDe(ref, nom)
                const ecoManuel = String((manuels[ref] || {}).eco || '').trim()
                const ecoDefaut = ecoPart(ref) ?? ecoExcel
                const ecoUsed = ecoManuel !== '' && !isNaN(parseFloat(ecoManuel))
                  ? parseFloat(ecoManuel)
                  : (savedEco(ref) ?? ecoDefaut ?? 0)
                const miniLive = minAll != null
                  ? Math.round((minAll + fraisUsed + (isNaN(parseFloat(ecoUsed)) ? 0 : parseFloat(ecoUsed))) * 1.2 / 0.98 * 100) / 100
                  : 0
                return (
                  <tr key={ref} className={`${intra ? styles.rowIntrouvable : ''} ${estNouveau ? styles.rowVert : ''} ${jaunes[ref] ? styles.rowMarque : ''}`}>
                    <td className={styles.colMarque} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={styles.checkMarque}
                        checked={!!jaunes[ref]}
                        onChange={() => toggleJaune(ref)}
                        title="Marquer en vert / dé-marquer"
                      />
                    </td>
                    <td className={styles.num}>{i + 1}</td>
                    <td>
                      <code className={styles.ref}>{ref}</code>
                      {estNouveau && !intra && <span className={styles.badgeNouveau}>nouveau</span>}
                    </td>
                    <td>{p && val(p, 'ean13') ? <span className={styles.ean}>{String(val(p, 'ean13')).toUpperCase()}</span> : (
                      <input className={styles.saisie} placeholder="EAN13…" value={manuel(ref, 'ean13')}
                        onChange={e => setManuel(ref, 'ean13', e.target.value)} />
                    )}</td>
                    <td>{p && val(p, 'famille') ? <span className={styles.famille}>{val(p, 'famille')}</span> : (
                      <input className={styles.saisie} placeholder="Famille…" value={manuel(ref, 'famille')}
                        onChange={e => setManuel(ref, 'famille', e.target.value)} />
                    )}</td>
                    <td>{p && val(p, 'sous_famille') ? <span className={styles.sousFamille}>{val(p, 'sous_famille')}</span> : (
                      <input className={styles.saisie} placeholder="Sous-famille…" value={manuel(ref, 'sous_famille')}
                        onChange={e => setManuel(ref, 'sous_famille', e.target.value)} />
                    )}</td>
                    <td>
                      {nom ? <span className={styles.nomCell}>{nom}</span> : (
                        <input className={styles.saisie} placeholder="Nom…" value={manuel(ref, 'nom')}
                          onChange={e => setManuel(ref, 'nom', e.target.value)} />
                      )}
                    </td>
                    <td>
                      <span className={styles.prixDual}>
                        {prixExcel.length === 0 && <span className={styles.badgeGris}>—</span>}
                        {prixExcel.map(({ site, v }) => {
                          const isMin = minAll != null && v === minAll
                          return (
                            <span key={site}
                              className={`${styles.prixExcel}${isMin ? ' ' + styles.prixMinDot : ''}`}>
                              {SITE_LABEL[site]} {v.toFixed(2)} €
                            </span>
                          )
                        })}
                      </span>
                    </td>
                    {SITES.map(s => {
                      const v = prixSite(ref, s)
                      const efface = prixSiteEfface(ref, s)
                      const corrige = !efface && prixSiteCorrige(ref, s)
                      const cls = [
                        styles.saisie,
                        styles.saisiePrix,
                        v == null ? styles.saisieVide : '',
                        efface ? styles.saisieEfface : '',
                        corrige ? styles.saisieCorrige : '',
                        minAll != null && v === minAll ? styles.prixMinDot : '',
                      ].filter(Boolean).join(' ')
                      return (
                        <td key={s}>
                          <SaisieChamp
                            onCommit={setSaisie}
                            ligne={ref}
                            field={'prix_' + s}
                            className={cls}
                            inputMode="decimal"
                            value={saisiePrix(ref, s)}
                            placeholder={efface ? 'effacé' : (v != null ? undefined : '—')}
                            title={titreSite(ref, s, v, corrige, efface)}
                          />
                        </td>
                      )
                    })}
                    <td className={styles.concCell}>
                      {(() => {
                        const efface = conc1Efface(ref)
                        return (
                          <div className={styles.conc} title={titreConc(ref)}>
                            <SaisieChamp
                              onCommit={setSaisie}
                              ligne={ref}
                              field="conc1"
                              className={`${styles.saisie} ${styles.saisieConc}${efface ? ' ' + styles.saisieEfface : ''}`}
                              placeholder={efface ? 'effacé' : 'Prix + marchand (ex : 311 Ubaldi)…'}
                              value={conc1Texte(ref)}
                            />
                          </div>
                        )
                      })()}
                    </td>
                    <td className={styles.dispoCell}>
                      <div className={styles.dispoList}>
                        {SITES.map(s => {
                          const d = dispoSite(ref, s)
                          return (
                            <span key={s} className={`${styles.dispoChip} ${styles[dispoClasse(d)]}`}>
                              {SITE_LABEL[s]}
                              <b>{d || '—'}</b>
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className={styles.ecoCell}>
                      <input
                        className={styles.saisie}
                        inputMode="decimal"
                        style={{ width: 64, color: ecoManuel !== '' ? 'var(--text)' : (ecoPart(ref) != null ? '#f97316' : '#22c55e'), fontWeight: 700 }}
                        value={ecoManuel !== '' ? ecoManuel : (savedEco(ref) != null ? String(savedEco(ref)) : (ecoDefaut != null ? String(ecoDefaut) : ''))}
                        placeholder="Eco…"
                        title={
                          ecoExcel != null && ecoPart(ref) != null && Math.abs(ecoExcel - ecoPart(ref)) > 0.001
                            ? `Excel ${ecoExcel.toFixed(2)} € / Site ${ecoPart(ref).toFixed(2)} € — modifiable (utilisé pour le mini)`
                            : `Eco-part utilisée pour le mini : ${ecoUsed} € (modifiable)`
                        }
                        onChange={e => setManuel(ref, 'eco', e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className={styles.fraisCell}>
                      <SaisieChamp
                        onCommit={setManuel}
                        ligne={ref}
                        field="frais"
                        className={styles.saisie}
                        inputMode="decimal"
                        extraStyle={STYLE_FR}
                        value={String(fraisUsed)}
                        title={`Frais utilisé pour le calcul du mini : ${fraisUsed} € (modifiable — recalcul au clic sur Appliquer)`}
                      />
                    </td>
                    <td>
                      {miniLive != null ? (
                        <span className={styles.miniExcel}>{miniLive.toFixed(2)} €</span>
                      ) : (
                        <span className={styles.badgeGris}>—</span>
                      )}
                    </td>
                    <td>
                      {refsInfo[ref]?.supprime && !aManuels(ref)
                        ? <span className={styles.statutSupp} title="Référence marquée en rouge (à supprimer)"><Trash2 size={13}/> Supprimé</span>
                        : aSupprimer(ref)
                          ? <span className={styles.statutSupp} title="Marquage en rouge automatique"><Loader size={13} className={styles.spin}/> Suppression…</span>
                          : sansPrixSite(ref)
                            ? <span className={styles.statutIntra}><XCircle size={13}/>-</span>
                            : refsInfo[ref]?.dans_excel && (estAJour(ref) || refsInfo[ref]?.maj) && !aManuels(ref)
                              ? <span className={styles.statutOk}><CheckCircle2 size={13}/> À jour</span>
                              : <span className={styles.statutOk}><CheckCircle2 size={13}/> Trouvé</span>}
                    </td>
                    <td>
                      {refsInfo[ref]?.supprime && !aManuels(ref) ? (
                        <span className={styles.muted}>—</span>
                      ) : aSupprimer(ref) ? (
                        <span className={styles.muted}>marquage…</span>
                      ) : aActionner(ref) ? (
                        <button className={styles.btnMaj}
                          onClick={() => appliquer(ref)}
                          disabled={busy || busyRefs[ref]}>
                          {busy || busyRefs[ref] ? <Loader size={12} className={styles.spin}/> : <RefreshCw size={12}/>}
                          {estNouveau ? 'à ajouter' : 'à mettre à jour'}
                        </button>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {(status === 'done' || status === 'stopped') && refsAffichees.length === 0 && (
        <div className={styles.empty}>
          <Search size={34} className={styles.emptyIcon} />
          <p>{status === 'stopped' ? 'Recherche arrêtée — aucun résultat' : 'Aucune référence lancée'}</p>
        </div>
      )}
    </div>
  )
}