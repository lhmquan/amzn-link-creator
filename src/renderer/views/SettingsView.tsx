import { useEffect, useState } from 'react'
import { Save, Globe, ExternalLink, XCircle, Sparkles } from 'lucide-react'
import type { AppSettings, WebhookTestResult, AiTestResult } from '@shared/types'

// Settings lưu delay/timeout bằng ms; UI hiển thị & nhập bằng giây cho dễ thiết lập.
const msToSec = (ms: number): number => Math.round((ms / 1000) * 100) / 100
const secToMs = (sec: string): number => Math.max(0, Math.round(Number(sec) * 1000))

export default function SettingsView(): JSX.Element {
  const [s, setS] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [aiSample, setAiSample] = useState('')
  const [aiResult, setAiResult] = useState<AiTestResult | null>(null)
  const [aiTesting, setAiTesting] = useState(false)

  useEffect(() => {
    window.amzn.settings.get().then(setS).catch(() => {})
    window.amzn.browser.status().then((r) => setBrowserOpen(r.open)).catch(() => {})
    window.amzn.autoStart.get().then(setAutoStart).catch(() => {})
    const offBrowser = window.amzn.browser.onStatusChanged((open) => setBrowserOpen(open))
    return offBrowser
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

  // Test AI: lưu cấu hình trước rồi gọi thật API với tên sản phẩm mẫu.
  const testAi = async (): Promise<void> => {
    setAiTesting(true)
    setAiResult(null)
    try {
      await window.amzn.settings.save(s)
      const r = await window.amzn.ai.test(aiSample)
      setAiResult(r)
    } finally {
      setAiTesting(false)
    }
  }

  const toggleAutoStart = async (enabled: boolean): Promise<void> => {
    setAutoStart(enabled)
    await window.amzn.autoStart.set(enabled).catch(() => {})
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
        <div className="grid3">
          <label>
            Tên event lấy dữ liệu
            <input value={s.fetchEvent} onChange={(e) => set('fetchEvent', e.target.value)} />
          </label>
          <label>
            Tên event báo kết quả
            <input value={s.reportEvent} onChange={(e) => set('reportEvent', e.target.value)} />
          </label>
          <label>
            Tên event lấy nguồn
            <input value={s.sourceEvent} onChange={(e) => set('sourceEvent', e.target.value)} />
          </label>
          <label>
            Tên event Get ASIN
            <input value={s.asinEvent} onChange={(e) => set('asinEvent', e.target.value)} />
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
            Delay giữa thao tác (giây)
            <input
              type="number"
              min="0"
              step="0.1"
              value={msToSec(s.delayMs)}
              onChange={(e) => set('delayMs', secToMs(e.target.value))}
            />
          </label>
          <label>
            Delay giữa các dòng (giây)
            <input
              type="number"
              min="0"
              step="0.1"
              value={msToSec(s.rowDelayMs)}
              onChange={(e) => set('rowDelayMs', secToMs(e.target.value))}
            />
          </label>
          <label>
            Timeout tải trang (giây)
            <input
              type="number"
              min="0"
              step="0.1"
              value={msToSec(s.pageTimeoutMs)}
              onChange={(e) => set('pageTimeoutMs', secToMs(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>AI sinh caption</h2>
        <p className="muted">
          Amazon đã bỏ Caption Generator trên SiteStripe, nên caption do AI của app sinh ra từ tên
          sản phẩm, rồi gửi về N8N như cũ. Dùng API tương thích OpenAI (endpoint
          <code> /chat/completions</code>).
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={s.aiEnabled}
            onChange={(e) => set('aiEnabled', e.target.checked)}
          />
          Bật sinh caption bằng AI
        </label>
        <div className="grid2">
          <label>
            Base URL
            <input
              value={s.aiBaseUrl}
              onChange={(e) => set('aiBaseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label>
            Model
            <input
              value={s.aiModel}
              onChange={(e) => set('aiModel', e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </label>
        </div>
        <label>
          API Key
          <input
            type="password"
            value={s.aiApiKey}
            onChange={(e) => set('aiApiKey', e.target.value)}
            placeholder="sk-..."
          />
        </label>
        <div className="grid2">
          <label>
            Giới hạn độ dài caption (ký tự, 0 = không giới hạn)
            <input
              type="number"
              min="0"
              step="10"
              value={s.aiMaxLength}
              onChange={(e) => set('aiMaxLength', Math.max(0, Math.round(Number(e.target.value))))}
            />
          </label>
          <label>
            Timeout gọi AI (giây)
            <input
              type="number"
              min="0"
              step="1"
              value={msToSec(s.aiTimeoutMs)}
              onChange={(e) => set('aiTimeoutMs', secToMs(e.target.value))}
            />
          </label>
        </div>
        <label>
          Prompt (biến khả dụng: {'{title}'} tên sản phẩm · {'{url}'} link Amazon · {'{link}'}{' '}
          affiliate link · {'{maxLength}'} giới hạn ký tự)
          <textarea
            className="prompt"
            rows={7}
            value={s.aiPrompt}
            onChange={(e) => set('aiPrompt', e.target.value)}
            placeholder="Viết caption cho sản phẩm: {title}"
          />
        </label>
        <label>
          Tên sản phẩm mẫu để test (bỏ trống sẽ dùng sản phẩm mẫu có sẵn)
          <input
            value={aiSample}
            onChange={(e) => setAiSample(e.target.value)}
            placeholder="Anker Soundcore Life Q30 Headphones…"
          />
        </label>
        <div className="row">
          <button onClick={testAi} disabled={aiTesting}>
            <Sparkles size={16} /> {aiTesting ? 'Đang gọi AI…' : 'Test AI'}
          </button>
          {aiResult && (
            <span className={aiResult.ok ? 'badge on' : 'badge off'}>
              {aiResult.ok
                ? `OK — ${aiResult.model ?? s.aiModel} · ${aiResult.caption?.length ?? 0} ký tự`
                : `Lỗi: ${aiResult.error}`}
            </span>
          )}
        </div>
        {aiResult?.ok && aiResult.caption && <pre className="preview">{aiResult.caption}</pre>}
      </section>

      <div className="row">
        <button className="primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
        </button>
        {savedAt && <span className="muted">Đã lưu lúc {new Date(savedAt).toLocaleTimeString('vi-VN')}</span>}
      </div>

      <section className="card">
        <h2>Hệ thống</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => toggleAutoStart(e.target.checked)}
          />
          Khởi động cùng Windows
        </label>
        <p className="muted">
          Đóng cửa sổ (nút X) sẽ thu app xuống khay hệ thống (tray), không thoát. Để thoát hẳn, chuột
          phải vào icon tray và chọn "Thoát".
        </p>
      </section>
    </div>
  )
}
