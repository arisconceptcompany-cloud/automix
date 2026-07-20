import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, FileSpreadsheet, Trash2, Download, Search, RefreshCw } from 'lucide-react'
import axios from 'axios'
import { getCache, setCache, invalidatePrefix } from '../cache'
import ProgressBar from '../components/ProgressBar'
import styles from './Excel.module.css'

export default function Excel() {
  const [produits, setProduits] = useState([])
  const [colonnes, setColonnes] = useState([])
  const [info,     setInfo]     = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [msg,      setMsg]      = useState(null)
  const [dragging, setDragging] = useState(false)
  const [filtre,   setFiltre]   = useState('')
  const fileRef = useRef()

  // ── Charger au montage de la page ────────────────────────
  useEffect(() => { charger(false) }, [])

  // ── Charger le contenu du fichier Excel sauvegardé ──────
  const charger = useCallback(async (force) => {
    if (!force) {
      const cached = getCache('excel_produits', 120000)
      if (cached) {
        setProduits(cached.produits || [])
        const rawCols = cached.colonnes || []
        const seen = {}
        const cols = rawCols.map(c => {
          if (seen[c] === undefined) { seen[c] = 0; return c }
          seen[c]++; return `${c}_${seen[c]}`
        })
        setColonnes(cols)
        setInfo(cached.info || null)
        return
      }
    }
    setLoading(true)
    try {
      const r = await axios.get('/api/excel/produits')
      const data = r.data
      setCache('excel_produits', { produits: data.produits || [], colonnes: data.colonnes || [], info: data.info || null })
      setProduits(data.produits || [])
      const rawCols = data.colonnes || []
      const seen = {}
      const cols = rawCols.map(c => {
        if (seen[c] === undefined) { seen[c] = 0; return c }
        seen[c]++; return `${c}_${seen[c]}`
      })
      setColonnes(cols)
      setInfo(data.info || null)
      if (data.avertissement) {
        setMsg({ type: 'warn', texte: data.avertissement })
      }
    } catch {
      setProduits([]); setColonnes([]); setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Upload + sauvegarde + affichage immédiat ─────────────
  const uploader = async (file) => {
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setMsg({ type: 'err', texte: 'Format non supporté — utilisez .xlsx ou .xls' }); return
    }
    setLoading(true); setUploadProgress(0); setMsg(null)
    const form = new FormData()
    form.append('fichier', file)
    try {
      const r = await axios.post('/api/excel/upload', form, {
        onUploadProgress: e => setUploadProgress(Math.round((e.loaded / e.total) * 100))
      })
      setMsg({ type: 'ok', texte: `✅ ${r.data.message}` })
      invalidatePrefix('excel_')
      await charger(true)
    } catch (e) {
      setMsg({ type: 'err', texte: e.response?.data?.erreur || "Erreur lors de l'import" })
      setLoading(false)
    } finally {
      setUploadProgress(null)
    }
  }

  // ── Supprimer le fichier ─────────────────────────────────
  const supprimer = async () => {
    if (!confirm('Supprimer le fichier Excel du serveur ?')) return
    try {
      await axios.delete('/api/excel/supprimer')
      invalidatePrefix('excel_')
      setProduits([]); setColonnes([]); setInfo(null); setFiltre('')
      setMsg({ type: 'ok', texte: 'Fichier supprimé' })
    } catch (e) {
      setMsg({ type: 'err', texte: e.response?.data?.erreur || 'Erreur' })
    }
  }

  // ── Rafraîchir après upload d'un autre utilisateur ──────
  useEffect(() => {
    const interval = setInterval(() => {
      charger(true)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // ── Colonnes à masquer ──────────────────────────────────────
  const MOTS_CACHER = [
    'materiaux', 'material', 'coloris', 'couleur', 'color',
    'debit nominal', 'debit', 'classe energie', 'classe énergie',
    'classe', 'energie', 'énergie',
    'largeur', 'width',
    'tarif de base', 'tarif',
    'prix avec remise', 'remise', 'discount',
    'prime',
    'prix facture', 'facture', 'invoice',
    'differe', 'différé', 'deferred',
    'ppi',
  ]

  const colonneVisible = (colName) => {
    const base = colName.replace(/_\d+$/, '').toLowerCase().trim()
    return !MOTS_CACHER.some(m => base.includes(m))
  }

  // ── Colonnes à afficher (dédupliquées + filtrées) ──────────
  const cols = colonnes.length > 0
    ? colonnes.filter(colonneVisible)
    : produits.length > 0
      ? (() => {
          const seen = {}
          return Object.keys(produits[0])
            .filter(k => !k.startsWith('_'))
            .filter(colonneVisible)
            .map(c => {
              if (seen[c] === undefined) { seen[c] = 0; return c }
              seen[c]++; return `${c}_${seen[c]}`
            })
        })()
      : []

  // ── Filtrage ─────────────────────────────────────────────
  const produitsFiltres = produits.filter(p =>
    !filtre || Object.values(p).some(v =>
      String(v ?? '').toLowerCase().includes(filtre.toLowerCase())
    )
  )

  return (
    <div className={styles.page}>

      {/* En-tête */}
      <div className={styles.header}>
        <FileSpreadsheet size={22} />
        <div>
          <h1>Fichier Excel de référence</h1>
          <p>Importez votre catalogue — les produits seront comparés lors du scraping</p>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`${styles.msg} ${styles['msg_' + msg.type]}`}>
          <span>{msg.texte}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* Zone de drop / upload */}
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropActive : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); uploader(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current.click()}
      >
        <Upload size={28} className={styles.dropIcon} />
        <p className={styles.dropTitle}>
          {info
            ? `📄 ${info.nom} — ${info.total} produit(s)`
            : 'Glissez votre fichier Excel ici'}
        </p>
        <p className={styles.dropSub}>
          {info
            ? 'Cliquez pour remplacer par un autre fichier'
            : 'ou cliquez pour sélectionner — .xlsx, .xls'}
        </p>
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" hidden
          onChange={e => { uploader(e.target.files[0]); e.target.value = '' }}
        />
      </div>

      {/* Barre d'actions + recherche */}
      {info && (
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              placeholder={`Rechercher parmi ${info.total} produits...`}
              value={filtre}
              onChange={e => setFiltre(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <div className={styles.toolbarActions}>
            <button className={styles.iconBtn} onClick={() => charger(true)} disabled={loading}>
              <RefreshCw size={14} className={loading ? styles.spin : ''} /> Actualiser
            </button>
            <button className={styles.iconBtn} onClick={() => window.open('https://auto.aris-cc.com/api/excel/telecharger', '_blank')}>
              <Download size={14} /> Exporter
            </button>
            <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={supprimer}>
              <Trash2 size={14} /> Supprimer
            </button>
          </div>
        </div>
      )}

      {/* Tableau */}
      {loading ? (
        <div className={styles.loading}><ProgressBar value={uploadProgress} /></div>
      ) : produits.length === 0 ? (
        <div className={styles.empty}>
          <FileSpreadsheet size={40} className={styles.emptyIcon} />
          <p>Aucun fichier Excel chargé</p>
          <span>Glissez ou cliquez sur la zone ci-dessus pour importer votre fichier</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <div className={styles.tableInfo}>
            {filtre
              ? `${produitsFiltres.length} résultat(s) sur ${produits.length} produit(s)`
              : `${produits.length} produit(s) — ${cols.length} colonne(s)`}
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                {cols.map((c, i) => <th key={`h_${i}_${c}`}>{c.replace(/_\d+$/, '')}</th>)}
              </tr>
            </thead>
            <tbody>
              {produitsFiltres.map((p, i) => (
                <tr key={i} className={p._modifie ? styles.rowModifie : ''}>
                  <td className={styles.num}>{i + 1}</td>
                  {cols.map((c, ci) => {
                    // Récupérer la valeur — gérer les colonnes dupliquées
                    const baseKey = c.replace(/_\d+$/, '')
                    const val = p[baseKey] ?? p[c] ?? null
                    return (
                      <td key={`c_${i}_${ci}`} title={String(val ?? '')}>
                        {val !== null && val !== undefined ? String(val) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
