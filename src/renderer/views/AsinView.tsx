import { useState } from 'react'
import { Barcode, Play } from 'lucide-react'
import type { AsinResult } from '@shared/types'

export default function AsinView(): JSX.Element {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AsinResult | null>(null)

  const run = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    setResult(null)
    try {
      const r = await window.amzn.asin.fetch()
      setResult(r)
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="view">
      <h1>Get ASIN</h1>

      <section className="card">
        <h2>Bóc link gốc Amazon (ASIN)</h2>
        <p className="muted">
          Bấm Chạy để kích hoạt luồng N8N bóc link gốc Amazon có ASIN từ dữ liệu reddit đã lấy. N8N
          xử lý phía sau và trả kết quả về đây.
        </p>
        <div className="row">
          <button className="primary" onClick={run} disabled={running}>
            <Play size={16} className={running ? 'spin' : ''} />
            {running ? 'Đang chạy…' : 'Chạy'}
          </button>
          {result && (
            <span className={result.ok ? 'badge on' : 'badge off'}>
              {result.ok ? result.message ?? 'Thành công' : `Lỗi: ${result.error ?? 'Không rõ'}`}
            </span>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Hướng dẫn</h2>
        <p className="muted">
          <Barcode size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Event gửi đi cấu hình tại Cài đặt → Webhook N8N (mặc định <code>get_asin</code>). Dùng để
          router luồng bóc ASIN trong N8N.
        </p>
      </section>
    </div>
  )
}
