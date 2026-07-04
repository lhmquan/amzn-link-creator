import { useEffect, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import type { ProgressPayload, BatchSummary } from '@shared/types'

export default function RunView(): JSX.Element {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [summary, setSummary] = useState<BatchSummary | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.amzn.batch.onProgress((p) => {
      setProgress(p)
      setLines((prev) => {
        const stamp = new Date().toLocaleTimeString('vi-VN')
        const next = [...prev, `[${stamp}] ${p.message}`]
        return next.slice(-200)
      })
      if (!p.busy && (p.stage === 'done' || p.stage === 'error')) setRunning(false)
    })
    return off
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [lines])

  const start = async (): Promise<void> => {
    setRunning(true)
    setSummary(null)
    setLines([])
    setProgress(null)
    try {
      const r = await window.amzn.batch.start()
      setSummary(r)
    } catch (e) {
      setLines((prev) => [...prev, `Lỗi: ${(e as Error).message}`])
    } finally {
      setRunning(false)
    }
  }

  const stop = (): void => {
    window.amzn.batch.stop()
  }

  const pct =
    progress?.total && progress.total > 0
      ? Math.round(((progress.current ?? 0) / progress.total) * 100)
      : 0

  return (
    <div className="view">
      <h1>Chạy batch</h1>

      <section className="card">
        <div className="row">
          {running ? (
            <button className="danger" onClick={stop}>
              <Square size={16} /> Dừng
            </button>
          ) : (
            <button className="primary" onClick={start}>
              <Play size={16} /> Bắt đầu
            </button>
          )}
          {progress?.total ? (
            <span className="muted">
              {progress.current ?? 0}/{progress.total} · ✓ {progress.okCount ?? 0} · ✗ {progress.errCount ?? 0}
            </span>
          ) : null}
        </div>

        {progress?.total ? (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
        ) : null}

        {progress && <div className="status">{progress.message}</div>}

        {summary && (
          <div className={summary.ok ? 'badge on' : 'badge off'}>
            {summary.error
              ? `Kết thúc: ${summary.error}`
              : `Xong — ${summary.okCount}/${summary.total} thành công, ${summary.errCount} lỗi`}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Tiến trình</h2>
        <div className="console" ref={logRef}>
          {lines.length === 0 ? (
            <div className="muted">Chưa có hoạt động.</div>
          ) : (
            lines.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </section>
    </div>
  )
}
