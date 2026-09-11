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
const SITE_EXCEL_KEY = { cedi: 'cedi', findis: 'find', gpdis: 'gpdis', sogam: 'sogam' }

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
  const [pleinEcran, setPleinEcran] = useState(false)
  const [manuels, setManuels] = useState({})

  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(null)

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

  const refsFiltres = useMemo(() => {
    const f = norm(filtre)
    if (!f) return refsDispo
    return refsDispo.filter(r => norm(r.ref).includes(f) || norm(r.nom).includes(f))
  }, [refsDispo, filtre])

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
      setRefsSel(all)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    chargerProduits()
  }, [chargerProduits])

  useEffect(() => {
    if (!jobId || status !== 'running') return
    let stop = false
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
        setDoneRefs(d.done_refs || [])
        setRefsInfo(d.refs || {})
        if (d.status === 'done' || d.status === 'error' || d.status === 'stopped') {
          setStatus(d.status)
          if (d.duree != null) setElapsed(d.duree)
          else if (startedAt.current) setElapsed(Math.round((Date.now() - startedAt.current) / 1000))
          if (d.message) setJobMsg(d.message)
        }
      } catch {
        if (!stop) {
          stop = true
          clearInterval(timer)
          setStatus('error')
          setJobMsg('Impossible de suivre le job — le serveur a peut-être redémarré. Relance la recherche.')
        }
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
  }

  const toggleRef = (ref) => {
    setRefsSel(prev => prev.includes(ref) ? prev.filter(x => x !== ref) : [...prev, ref])
  }

  const toutSelectionner = () => setRefsSel(refsDispo.map(r => r.ref))
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
    for (const site of SITES) {
      const r = (results[ref] || {})[site]
      if (!r) continue
      if (r.introuvable) sites[site] = { introuvable: true }
      else sites[site] = { prix: r.prix }
    }
    return sites
  }

  const ecoPart = (ref) => {
    const r = (results[ref] || {}).cedi
    return r && typeof r.ecopart === 'number' ? r.ecopart : null
  }

  const trouverPrix = (ref) =>
    Object.values(results[ref] || {}).some(r => r && !r.introuvable && r.prix != null)

  const conc1De = (ref) => conc1Map[ref]

  const aManuels = (ref) => Object.values(manuels[ref] || {}).some(v => String(v || '').trim() !== '')
  const manuelsHorsConc = (ref) => {
    const m = manuels[ref] || {}
    return ['ean13', 'famille', 'sous_famille', 'nom'].some(k => String(m[k] || '').trim() !== '')
  }
  const aAppliquer = (ref) => trouverPrix(ref) || manuelsHorsConc(ref)
  const sansPrixSite = (ref) => !trouverPrix(ref)
  const aSupprimer = (ref) => sansPrixSite(ref) && !!refsInfo[ref]?.dans_excel

  const appliquer = async (ref, silencieux = false) => {
    const sites = payloadSites(ref)
    const m = manuels[ref] || {}
    const conc1Auto = conc1Map[ref]?.prix ?? null
    const conc1Manuel = (m.conc1 || '').trim()
    if (Object.keys(sites).length === 0 && !aManuels(ref) && conc1Auto == null && !conc1Manuel) return
    setBusy(true)
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
      let r
      if (refsInfo[ref]?.dans_excel) {
        r = await axios.post('/api/multi-scraper/mettre-a-jour', base)
      } else {
        r = await axios.post('/api/multi-scraper/ajouter', { ...base, eco_part: ecoPart(ref) })
      }
      if (!silencieux) setMsg({ type: 'ok', texte: r.data.message })
      return r.data
    } catch (e) {
      if (!silencieux) setMsg({ type: 'err', texte: e.response?.data?.erreur || "Erreur lors de l'application" })
    } finally {
      if (!silencieux) setBusy(false)
    }
  }

  const appliquerTout = async () => {
    setBusy(true)
    let maj = 0, ajout = 0, sup = 0
    const suppRefs = []
    for (const ref of Object.keys(results)) {
      if (aSupprimer(ref)) {
        try {
          await axios.delete('/api/multi-scraper/supprimer-reference', { data: { reference: ref } })
          sup++
          suppRefs.push(ref)
        } catch {
          // ligne ignorée si sa suppression a échoué
        }
        continue
      }
      if (!aAppliquer(ref)) continue
      try {
        const d = await appliquer(ref, true)
        if (d) {
          if (d.ajout > 0) ajout++
          else if (d.mis_a_jour > 0) maj++
        }
      } catch {
        // ligne ignorée si son application a échoué
      }
    }
    if (sup > 0) {
      const setS = new Set(suppRefs)
      setResults(prev => { const n = {}; for (const k of Object.keys(prev)) if (!setS.has(k)) n[k] = prev[k]; return n })
      setRefsInfo(prev => { const n = {}; for (const k of Object.keys(prev)) if (!setS.has(k)) n[k] = prev[k]; return n })
      setConc1Map(prev => { const n = {}; for (const k of Object.keys(prev)) if (!setS.has(k)) n[k] = prev[k]; return n })
      setDispoMap(prev => { const n = {}; for (const k of Object.keys(prev)) if (!setS.has(k)) n[k] = prev[k]; return n })
      setDoneRefs(prev => prev.filter(x => !setS.has(x)))
    }
    setBusy(false)
    chargerProduits()
    const morceaux = []
    if (maj) morceaux.push(`${maj} mis à jour`)
    if (ajout) morceaux.push(`${ajout} ajouté(s)`)
    if (sup) morceaux.push(`${sup} supprimé(s)`)
    setMsg({ type: 'ok', texte: morceaux.length ? `${morceaux.join(', ')} dans l'Excel` : "Rien à appliquer" })
  }

  const supprimer = async (ref) => {
    setBusy(true)
    try {
      const r = await axios.delete('/api/multi-scraper/supprimer-reference', { data: { reference: ref } })
      setResults(prev => { const n = { ...prev }; delete n[ref]; return n })
      setRefsInfo(prev => { const n = { ...prev }; delete n[ref]; return n })
      setConc1Map(prev => { const n = { ...prev }; delete n[ref]; return n })
      setDispoMap(prev => { const n = { ...prev }; delete n[ref]; return n })
      setDoneRefs(prev => prev.filter(x => x !== ref))
      chargerProduits()
      setMsg({ type: 'ok', texte: r.data.message })
    } catch (e) {
      setMsg({ type: 'err', texte: e.response?.data?.erreur || "Erreur lors de la suppression" })
    } finally {
      setBusy(false)
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
    const TRES_GRANDS = ['REFRIGERATEUR', 'CONGELATEUR', 'CAVE A VIN', 'CAVE-A-VIN', 'AMERICAIN', 'CONGELATEUR COFFRE', 'CONGELATEUR VERTICAL', 'ARM']
    const GRANDS = ['LAVE LINGE', 'LAVE-LINGE', 'SECHE LINGE', 'SECHE-LINGE', 'LAVE VAISSELLE', 'LAVE-VAISSELLE', 'CUISINIERE', 'CUISIERE', 'PIANO DE CUISSON', 'PIANO-DE-CUISSON', 'FOUR', 'FOURS', 'HOTTE', 'TABLE DE CUISSON', 'PLAQUE DE CUISSON', 'PLAN DE CUISSON']
    const MOYENS = ['MICRO ONDES', 'MICRO-ONDES', 'CAFE', 'CAFETIERE']
    if (TRES_GRANDS.some(g => n.includes(g))) return 80
    if (GRANDS.some(g => n.includes(g))) return 75
    if (MOYENS.some(g => n.includes(g))) return 60
    return 50
  }

  const fraisDe = (ref, nom) => {
    const m = manuels[ref] || {}
    const v = String(m.frais || '').trim()
    if (v !== '') {
      const n = parseFloat(v)
      if (!isNaN(n)) return n
    }
    return detecterFrais(nom)
  }

  const refsAffichees = Object.keys(refsInfo).filter(ref => results[ref])
  const pct = total > 0 ? Math.round((fait / total) * 100) : 0

  const excelPrix = (p) => {
    if (!p) return []
    const out = []
    for (const site of SITES) {
      const v = num(val(p, SITE_EXCEL_KEY[site]))
      if (v != null) out.push({ site, v })
    }
    return out
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

      <div className={styles.panel}>
        <div className={styles.refsHeader}>
          <label className={styles.label}>Références (auto-chargées depuis le fichier Excel)</label>
          <span className={styles.refsCount}>{references.length} / {refsDispo.length} sélectionnée(s)</span>
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
            <div className={styles.emptyListe}>Aucune référence dans le filtre</div>
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
            {refsAffichees.some(aAppliquer) && (
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
                const intra = !aAppliquer(ref)
                const estNouveau = refsInfo[ref] && !refsInfo[ref].dans_excel
                const prixExcel = excelPrix(p)
                const ecoExcel = p ? num(val(p, ['eco_part'])) : null
                const nom = (results[ref]?.cedi?.nom || p ? String(val(p, ['designation', 'désignation', 'nom', 'name']) || '') : '') || ''
                const minAll = (() => {
                  const vals = prixExcel.map(x => x.v)
                  const vue = Object.values(results[ref] || {}).filter(r => r && !r.introuvable && r.prix != null).map(r => parseFloat(r.prix))
                  vals.push(...vue)
                  const nums = vals.filter(v => !isNaN(v))
                  return nums.length ? Math.min(...nums) : null
                })()
                const fraisUsed = fraisDe(ref, nom)
                const ecoUsed = ecoPart(ref) ?? ecoExcel ?? 0
                const miniLive = minAll != null
                  ? Math.round((minAll + fraisUsed + (isNaN(parseFloat(ecoUsed)) ? 0 : parseFloat(ecoUsed))) * 1.2 / 0.98 * 100) / 100
                  : null
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
                      {(() => {
                        const ecoSite = ecoPart(ref)
                        if (ecoSite != null && ecoExcel != null && Math.abs(ecoSite - ecoExcel) > 0.001) {
                          return (
                            <span>
                              <span style={{ color: '#22c55e', fontWeight: 700 }} title="Eco-part Excel">{ecoExcel.toFixed(2)} €</span>
                              <span style={{ margin: '0 3px', opacity: .4 }}>/</span>
                              <span style={{ color: '#f97316', fontWeight: 700 }} title="Eco-part site">{ecoSite.toFixed(2)} €</span>
                            </span>
                          )
                        }
                        if (ecoSite != null) return <span style={{ color: '#f97316', fontWeight: 700 }}>{ecoSite.toFixed(2)} €</span>
                        if (ecoExcel != null) return <span style={{ color: '#22c55e', fontWeight: 700 }}>{ecoExcel.toFixed(2)} €</span>
                        return <span className={styles.badgeGris}>—</span>
                      })()}
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
                      {aSupprimer(ref)
                        ? <span className={styles.statutSupp}><Trash2 size={13}/> Supprimer</span>
                        : sansPrixSite(ref)
                          ? <span className={styles.statutIntra}><XCircle size={13}/>-</span>
                          : <span className={styles.statutOk}><CheckCircle2 size={13}/> Trouvé</span>}
                    </td>
                    <td>
                      {aSupprimer(ref) ? (
                        <button className={styles.btnSupp}
                          onClick={() => supprimer(ref)}
                          disabled={busy}>
                          <Trash2 size={12}/> Supprimer
                        </button>
                      ) : trouverPrix(ref) ? (
                        <button className={styles.btnMaj}
                          onClick={() => appliquer(ref)}
                          disabled={busy}>
                          {busy ? <Loader size={12} className={styles.spin}/> : <RefreshCw size={12}/>}
                          {estNouveau ? 'à ajouter' : 'à mettre à jour'}
                        </button>
                      ) : (
                        !refsInfo[ref]?.dans_excel && manuelsHorsConc(ref) && (
                          <button className={styles.btnMaj}
                            onClick={() => appliquer(ref)}
                            disabled={busy}>
                            {busy ? <Loader size={12} className={styles.spin}/> : <RefreshCw size={12}/>}
                            à ajouter
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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