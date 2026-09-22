import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
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

const num = (v) => {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
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
  const setManuel = (ref, field, v) =>
    setManuels(m => ({ ...m, [ref]: { ...(m[ref] || {}), [field]: v } }))

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

  // ── Persistance de session (résultats conservés au changement de menu) ──
  const enregistrerSession = useCallback(() => {
    if (!jobId) return
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        jobId, status, fait, total, current, elapsed, jobMsg,
        refsSel, sitesActifs, filtre, manuels, savedAt: Date.now(),
      }))
    } catch { /* stockage local indisponible */ }
  }, [jobId, status, fait, total, current, elapsed, jobMsg, refsSel, sitesActifs, filtre, manuels])

  useEffect(() => { enregistrerSession() }, [enregistrerSession])

  useEffect(() => {
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') }
    catch { saved = null }
    if (!saved || !saved.jobId) return

    if (Array.isArray(saved.refsSel)) restoredSelRef.current = saved.refsSel

    let essais = 0
    let timerRestore = null
    const recupererStatut = () => {
      axios.get(`/api/multi-scraper/statut/${saved.jobId}`)
        .then(r => {
          const d = r.data
          if (saved.filtre) setFiltre(saved.filtre)
          if (saved.manuels) setManuels(saved.manuels)
          if (saved.sitesActifs) setSitesActifs(saved.sitesActifs)
          setSessionExiste(true)
          setJobId(saved.jobId)
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
          setRefsInfo(d.refs || {})
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
    return () => { if (timerRestore) clearTimeout(timerRestore) }
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
    setSessionExiste(false)
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

  const payloadSites = (ref) => {
    const sites = {}
    const enCours = status === 'running' || status === 'pending'
    for (const site of SITES) {
      const r = (results[ref] || {})[site]
      if (r && !r.introuvable && r.prix != null) {
        sites[site] = { prix: r.prix }
      } else if (r && r.introuvable) {
        sites[site] = { introuvable: true }
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
    const site = ecoPart(ref)
    if (site != null) return site
    return ecoDe(refsExcelMap.get(norm(ref)))
  }

  const trouverPrix = (ref) =>
    Object.values(results[ref] || {}).some(r => r && !r.introuvable && r.prix != null)

  const conc1De = (ref) => conc1Map[ref]

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
    const res = results[ref] || {}
    if (refsInfo[ref] && !refsInfo[ref].dans_excel) return false
    const p = refsExcelMap.get(norm(ref))
    if (!p) return false
    for (const site of SITES) {
      const ev = num(val(p, ALT_EXCEL[site]))
      const r = res[site]
      const sv = r && !r.introuvable && r.prix != null ? parseFloat(r.prix) : null
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
    if (refsInfo[ref]?.supprime) return false
    if (refsInfo[ref] && !refsInfo[ref].dans_excel) return trouverPrix(ref) || aManuels(ref)
    if (aSupprimer(ref)) return false
    // Déjà marqué à jour : ne réafficher le bouton que si l'utilisateur a re-saisi un champ
    if (refsInfo[ref]?.maj) return aManuels(ref)
    return !estAJour(ref) || aManuels(ref)
  }

  const appliquer = async (ref, silencieux = false) => {
    const sites = payloadSites(ref)
    const m = manuels[ref] || {}
    const conc1Auto = conc1Map[ref]?.prix ?? null
    const conc1Manuel = (m.conc1 || '').trim()
    const ecoVal = ecoUtilise(ref)
    if (Object.keys(sites).length === 0 && !aManuels(ref) && conc1Auto == null && !conc1Manuel && ecoVal == null) return
    if (!silencieux) setBusyRefs(prev => ({ ...prev, [ref]: true }))
    try {
      const base = {
        reference: ref,
        nom: (m.nom || '').trim() || (results[ref] || {}).cedi?.nom || '',
        sites,
        disponibilite: dispoMap[ref] || undefined,
        conc1: conc1Auto != null ? conc1Auto : (conc1Manuel || undefined),
        ean13: (m.ean13 || '').trim() || undefined,
        famille: (m.famille || '').trim() || undefined,
        sous_famille: (m.sous_famille || '').trim() || undefined,
      }
      const fraisVal = (m.frais || '').trim()
      const fraisNum = fraisVal !== '' && !isNaN(parseFloat(fraisVal)) ? parseFloat(fraisVal) : null
      if (fraisNum != null) base.frais = fraisNum
      if (ecoVal != null) base.eco_part = ecoVal
      let r
      if (refsInfo[ref]?.dans_excel) {
        r = await axios.post('/api/multi-scraper/mettre-a-jour', base)
      } else {
        r = await axios.post('/api/multi-scraper/ajouter', base)
      }
      const dataMaj = r.data || {}
      if (refsInfo[ref]?.dans_excel) {
        // Succès HTTP : toujours marquer à jour (même si mis_a_jour === 0)
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
          return upd
        }))
        setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), maj: true, dans_excel: true } }))
        viderManuels(ref)
        pushToast(ref, 'mis à jour')
      } else if (dataMaj.ajout > 0) {
        setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), dans_excel: true, maj: true } }))
        viderManuels(ref)
        pushToast(ref, 'ajouté')
      }
      if (!silencieux) setMsg({ type: 'ok', texte: r.data.message })
      return r.data
    } catch (e) {
      if (!silencieux) setMsg({ type: 'err', texte: e.response?.data?.erreur || "Erreur lors de l'application" })
    } finally {
      if (!silencieux) setBusyRefs(prev => { const n = { ...prev }; delete n[ref]; return n })
    }
  }

  const appliquerTout = async () => {
    setBusy(true)
    let maj = 0, ajout = 0, sup = 0
    const refs = Object.keys(results).filter(r => aSupprimer(r) || aActionner(r))
    const LIMITE = 6
    let suivant = 0
    const travailleurs = Array.from({ length: Math.min(LIMITE, refs.length) }, async () => {
      while (suivant < refs.length) {
        const ref = refs[suivant++]
        if (aSupprimer(ref)) {
          try {
            await axios.delete('/api/multi-scraper/supprimer-reference', { data: { reference: ref } })
            setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), supprime: true } }))
            sup++
            pushToast(ref, 'supprimé')
          } catch {
            // ligne ignorée si son marquage a échoué
          }
          continue
        }
        try {
          const d = await appliquer(ref, true)
          if (d) {
            if (d.ajout > 0) ajout++
            else maj++
          }
        } catch {
          // ligne ignorée si son application a échoué
        }
      }
    })
    await Promise.all(travailleurs)
    setBusy(false)
    chargerProduits()
    const morceaux = []
    if (maj) morceaux.push(`${maj} mis à jour`)
    if (ajout) morceaux.push(`${ajout} ajouté(s)`)
    if (sup) morceaux.push(`${sup} marqué(s) en rouge`)
    setMsg({ type: 'ok', texte: morceaux.length ? `${morceaux.join(', ')} dans l'Excel` : "Rien à appliquer" })
  }

  const supprimer = async (ref) => {
    setBusyRefs(prev => ({ ...prev, [ref]: true }))
    try {
      const r = await axios.delete('/api/multi-scraper/supprimer-reference', { data: { reference: ref } })
      setRefsInfo(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), supprime: true } }))
      viderManuels(ref)
      setMsg({ type: 'ok', texte: r.data.message })
      pushToast(ref, 'supprimé')
    } catch (e) {
      setMsg({ type: 'err', texte: e.response?.data?.erreur || "Erreur lors du marquage en rouge" })
    } finally {
      setBusyRefs(prev => { const n = { ...prev }; delete n[ref]; return n })
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
    const p = refsExcelMap.get(norm(ref))
    if (p) {
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
    for (const r of Object.values(results[ref] || {})) {
      if (r && !r.introuvable && r.prix != null) {
        const v = parseFloat(r.prix)
        if (!isNaN(v)) vals.push(v)
      }
    }
    return vals.length ? Math.min(...vals) : null
  }

  const conc1PrixDe = (ref) => {
    const auto = conc1Map[ref]?.prix
    if (auto != null && !isNaN(parseFloat(auto))) return parseFloat(auto)
    const m = String((manuels[ref] || {}).conc1 || '').trim()
    if (m !== '') {
      const n = parseFloat(m)
      if (!isNaN(n)) return n
    }
    return null
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
                const minAll = (() => {
                  const nums = Object.values(results[ref] || {})
                    .filter(r => r && !r.introuvable && r.prix != null)
                    .map(r => parseFloat(r.prix))
                    .filter(v => !isNaN(v))
                  return nums.length ? Math.min(...nums) : null
                })()
                const fraisUsed = fraisDe(ref, nom)
                const ecoManuel = String((manuels[ref] || {}).eco || '').trim()
                const ecoDefaut = ecoPart(ref) ?? ecoExcel
                const ecoUsed = ecoManuel !== '' && !isNaN(parseFloat(ecoManuel))
                  ? parseFloat(ecoManuel)
                  : (ecoDefaut ?? 0)
                const miniLive = minAll != null
                  ? Math.round((minAll + fraisUsed + (isNaN(parseFloat(ecoUsed)) ? 0 : parseFloat(ecoUsed))) * 1.2 / 0.98 * 100) / 100
                  : 0
                const fraisManuel = String((manuels[ref] || {}).frais || '').trim()
                return (
                  <tr key={ref} className={`${intra ? styles.rowIntrouvable : ''} ${estNouveau ? styles.rowVert : ''}`}>
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
                      const r = (results[ref] || {})[s]
                      if (!r) return <td key={s} className={styles.muted}>-</td>
                      if (r.introuvable) return <td key={s} className={styles.muted}>-</td>
                      const v = parseFloat(r.prix)
                      return (
                        <td key={s}>
                          <span className={`${styles.prixSite}${minAll != null && v === minAll ? ' ' + styles.prixMinDot : ''}`}>
                            {v.toFixed(2)} €
                          </span>
                        </td>
                      )
                    })}
                    <td className={styles.concCell}>
                      {(() => {
                        const c1 = conc1De(ref)
                        if (c1 && c1.prix != null) {
                          const tip = []
                          if (c1.nom) tip.push(c1.nom)
                          if (c1.vendeur) tip.push('Vendeur : ' + c1.vendeur)
                          if (c1.url) tip.push(c1.url)
                          return (
                            <span className={styles.conc} title={tip.join(' · ')}>
                              <span className={styles.concPrix}>{c1.prix.toFixed(2)} €</span>
                              {c1.vendeur && <span className={styles.concVendeur}>{c1.vendeur}</span>}
                            </span>
                          )
                        }
                        return (
                          <div>
                            {c1?.introuvable ? <span className={styles.muted}>-</span> : <span className={styles.badgeGris}>—</span>}
                            {conc1De(ref)?.prix == null && (
                              <input className={`${styles.saisie} ${styles.saisiePrix}`} placeholder="Prix manuel €…"
                                value={manuel(ref, 'conc1')}
                                onChange={e => setManuel(ref, 'conc1', e.target.value)} />
                            )}
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
                        value={ecoManuel !== '' ? ecoManuel : (ecoDefaut != null ? String(ecoDefaut) : '')}
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
                      <input
                        className={styles.saisie}
                        inputMode="decimal"
                        style={{ width: 52 }}
                        value={fraisManuel !== '' ? fraisManuel : String(fraisUsed)}
                        title={`Frais utilisé pour le calcul du mini : ${fraisUsed} € (modifiable — recalcul au clic sur Appliquer)`}
                        onChange={e => setManuel(ref, 'frais', e.target.value)}
                        onClick={e => e.stopPropagation()}
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
                      {refsInfo[ref]?.supprime
                        ? <span className={styles.statutSupp} title="Référence marquée en rouge (à supprimer)"><Trash2 size={13}/> Supprimé</span>
                        : aSupprimer(ref)
                          ? <span className={styles.statutSupp} title={sansPrixSite(ref) ? 'Aucun prix sur CEDI/FINDIS/GPDIS/SOGAM' : 'Mini supérieur au prix concurrent (Conc 1)'}><Trash2 size={13}/> Supprimer</span>
                          : sansPrixSite(ref)
                            ? <span className={styles.statutIntra}><XCircle size={13}/>-</span>
                            : refsInfo[ref]?.dans_excel && (estAJour(ref) || refsInfo[ref]?.maj) && !aManuels(ref)
                              ? <span className={styles.statutOk}><CheckCircle2 size={13}/> À jour</span>
                              : <span className={styles.statutOk}><CheckCircle2 size={13}/> Trouvé</span>}
                    </td>
                    <td>
                      {refsInfo[ref]?.supprime ? (
                        <span className={styles.muted}>—</span>
                      ) : aSupprimer(ref) ? (
                        <button className={styles.btnSupp}
                          onClick={() => supprimer(ref)}
                          disabled={busy || busyRefs[ref]}
                          title={sansPrixSite(ref) ? 'Marquer en rouge : aucun prix site' : 'Marquer en rouge : mini > Conc 1'}>
                          {busyRefs[ref] ? <Loader size={12} className={styles.spin}/> : <Trash2 size={12}/>} Supprimer
                        </button>
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