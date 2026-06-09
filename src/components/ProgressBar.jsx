import styles from './ProgressBar.module.css'

export default function ProgressBar({ value, text }) {
  const isIndeterminate = value == null
  return (
    <div className={styles.wrapper}>
      {text && <div className={styles.text}>{text}</div>}
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${isIndeterminate ? styles.indeterminate : ''}`}
          style={!isIndeterminate ? { width: `${Math.round(value)}%` } : undefined}
        />
      </div>
      {!isIndeterminate && <span className={styles.percent}>{Math.round(value)}%</span>}
    </div>
  )
}
