import { useEffect, useState } from 'react'
import { Save, Globe, ExternalLink, XCircle } from 'lucide-react'
import type { AppSettings, WebhookTestResult } from '@shared/types'

export default function SettingsView(): JSX.Element {
  const [s, setS] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    window.amzn.settings.get().then(setS).catch(() => {})
    window.amzn.browser.status().then((r) => setBrowserOpen(r.open)).catch(() => {})
    const off = window.amzn.browser.onStatusChanged((open) => setBrowserOpen(open))
    return off
  }, [])

  if (!s) return <div className="view">Đang tải…</div>

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]): void =>
    setS({ ...s, [k]: v })

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const next = await window.amzn.settings.save(s)
      setS(next)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      // Lưu trước để test dùng đúng URL/secret hiện tại.
      await window.amzn.settings.save(s)
      const r = await window.amzn.webhook.test()
      setTestResult(r)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="view">
      <h1>Cài đặt</h1>

      <section className="card">
        <h2>Trình duyệt (Profile Amazon)</h2>
        <p className="muted">
          Mở profile để đăng nhập tài khoản Amazon Associates. Session được lưu lại cho các lần chạy sau.
        </p>
        <div className="row">
          <span className={browserOpen ? 'badge on' : 'badge off'}>
            {browserOpen ? 'Đang mở' : 'Đang đóng'}
          </span>
          {browserOpen ? (
            <button onClick={() => window.amzn.browser.close()}>
              <XCircle size={16} /> Đóng profile
            </button>
          ) : (
            <button onClick={() => window.amzn.browser.open()}>
              <ExternalLink size={16} /> Mở profile để đăng nhập
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Webhook N8N</h2>
        <label>
          Webhook URL
          <input value={s.webhookUrl} onChange={(e) => set('webhookUrl', e.target.value)} placeholder="https://n8n.example.com/webhook/..." />
        </label>
        <label>
          Webhook Secret (tùy chọn — gửi qua header X-Amzn-Secret)
          <input value={s.webhookSecret} onChange={(e) => set('webhookSecret', e.target.value)} type="password" />
        </label>
        <div className="grid2">
          <label>
            Tên event lấy dữ liệu
            <input value={s.fetchEvent} onChange={(e) => set('fetchEvent', e.target.value)} />
          </label>
          <label>
            Tên event báo kết quả
            <input value={s.reportEvent} onChange={(e) => set('reportEvent', e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button onClick={test} disabled={testing}>
            <Globe size={16} /> {testing ? 'Đang test…' : 'Test webhook'}
          </button>
          {testResult && (
            <span className={testResult.ok ? 'badge on' : 'badge off'}>
              {testResult.ok ? `OK — nhận ${testResult.rowCount ?? 0} dòng` : `Lỗi: ${testResult.error}`}
            </span>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Cấu hình xử lý</h2>
        <label>
          Tên cột chứa link Amazon trong Google Sheet
          <input value={s.linkColumn} onChange={(e) => set('linkColumn', e.target.value)} placeholder="AmazonUrl" />
        </label>
        <div className="grid2">
          <label>
            Store ID
            <input value={s.storeId} onChange={(e) => set('storeId', e.target.value)} />
          </label>
          <label>
            Tracking ID
            <input value={s.trackingId} onChange={(e) => set('trackingId', e.target.value)} />
          </label>
        </div>
        <label>
          Loại link
          <select value={s.linkType} onChange={(e) => set('linkType', e.target.value as 'short' | 'full')}>
            <option value="short">Short Link</option>
            <option value="full">Full Link</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={s.headless} onChange={(e) => set('headless', e.target.checked)} />
          Chạy ngầm (headless) khi chạy batch
        </label>
        <div className="grid3">
          <label>
            Delay giữa thao tác (ms)
            <input type="number" value={s.delayMs} onChange={(e) => set('delayMs', Number(e.target.value))} />
          </label>
          <label>
            Delay giữa các dòng (ms)
            <input type="number" value={s.rowDelayMs} onChange={(e) => set('rowDelayMs', Number(e.target.value))} />
          </label>
          <label>
            Timeout tải trang (ms)
            <input type="number" value={s.pageTimeoutMs} onChange={(e) => set('pageTimeoutMs', Number(e.target.value))} />
          </label>
        </div>
      </section>

      <div className="row">
        <button className="primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
        </button>
        {savedAt && <span className="muted">Đã lưu lúc {new Date(savedAt).toLocaleTimeString('vi-VN')}</span>}
      </div>
    </div>
  )
}
