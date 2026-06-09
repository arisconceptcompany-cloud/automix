import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Download, Trash2, Search } from 'lucide-react'
import axios from 'axios'
import styles from './PDFs.module.css'

export default function PDFs() {
  const [pdfs,     setPdfs]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [msg,      setMsg]      = useState(null)
  const [dragging, setDragging] = useState(false)
  const [filtre,   setFiltre]   = useState('')
  const fileRef = useRef()

  useEffect(() => { charger() }, [])

  const charger = async () => {
    setLoading(true)
    try {
      const r = await axios.get('/api/pdf/liste')
      setPdfs(r.data.pdfs || [])
    } catch { setPdfs([]) }
    finally { setLoading(false) }
  }

  const uploader = async (files) => {
    if (!files || files.length === 0) return
    const form = new FormData()
    let count = 0
    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.pdf')) {
        form.append('fichiers', f)
        count++
      }
    }
    if (count === 0) { setMsg({ type: 'err', texte: 'Sélectionnez des fichiers .pdf' }); return }
    setLoading(true); setMsg(null)
    try {
      const r = await axios.post('/api/pdf/upload', form)
      setMsg({ type: 'ok', texte: r.data.message })
      await charger()
    } catch (e) {
      setMsg({ type: 'err', texte: e.response?.data?.erreur || 'Erreur upload' })
    } finally { setLoading(false) }
  }

  const pdfsFiltres = pdfs.filter(p =>
    !filtre || p.toLowerCase().includes(filtre.toLowerCase())
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <FileText size={22} />
        <div>
          <h1>Fiches PDF produits</h1>
          <p>Importez les PDFs nommés <code>REFERENCE.pdf</code> — ils seront téléchargeables depuis le tableau des produits</p>
        </div>
      </div>

      {msg && (
        <div className={`${styles.msg} ${styles['msg_' + msg.type]}`}>
          <span>{msg.texte}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* Zone upload */}
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropActive : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); uploader(e.dataTransfer.files) }}
        onClick={() => fileRef.current.click()}
      >
        <Upload size={28} className={styles.dropIcon} />
        <p className={styles.dropTitle}>Glissez vos fichiers PDF ici</p>
        <p className={styles.dropSub}>
          Nommez-les <strong>REFERENCE.pdf</strong> (ex: <code>FN23841W.pdf</code>, <code>BFNA247E40SN.pdf</code>)
        </p>
        <input ref={fileRef} type="file" accept=".pdf" multiple hidden
          onChange={e => { uploader(e.target.files); e.target.value = '' }} />
      </div>

      {/* Barre recherche */}
      {pdfs.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input placeholder={`Rechercher parmi ${pdfs.length} PDF(s)...`}
              value={filtre} onChange={e => setFiltre(e.target.value)}
              className={styles.searchInput} />
          </div>
          <span className={styles.total}>{pdfsFiltres.length} / {pdfs.length} PDF(s)</span>
        </div>
      )}

      {/* Grille PDFs */}
      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : pdfs.length === 0 ? (
        <div className={styles.empty}>
          <FileText size={40} className={styles.emptyIcon} />
          <p>Aucun PDF importé</p>
          <span>Importez des fichiers PDF nommés par référence produit</span>
        </div>
      ) : (
        <div className={styles.grid}>
          {pdfsFiltres.map((ref, i) => (
            <div key={i} className={styles.card}>
              <FileText size={28} className={styles.cardIcon} />
              <div className={styles.cardRef}>{ref}</div>
              <div className={styles.cardActions}>
                <a
                  href={`/api/pdf/${encodeURIComponent(ref)}`}
                  download={`${ref}.pdf`}
                  className={styles.btnDownload}
                >
                  <Download size={13} /> Télécharger
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
