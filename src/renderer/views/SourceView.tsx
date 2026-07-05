import { useEffect, useState } from 'react'
import { Rss, Send, History } from 'lucide-react'
import type { SourceResult } from '@shared/types'

export default function SourceView(): JSX.Element {
  const [subreddit, setSubreddit] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SourceResult | null>(null)
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    window.amzn.source.recents().then(setRecents).catch(() => {})
  }, [])

  const run = async (name: string): Promise<void> => {
    const target = name.trim()
    if (!target || sending) return
    setSending(true)
    setResult(null)
    try {
      const r = await window.amzn.source.fetch(target)
      setResult(r)
      if (r.ok) {
        const list = await window.amzn.source.recents().catch(() => recents)
        setRecents(list)
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') run(subreddit)
  }

  const pickRecent = (name: string): void => {
    setSubreddit(name)
    run(name)
  }

  return (
    <div className="view">
      <h1>Lấy nguồn</h1>

      <section className="card">
        <h2>Subreddit</h2>
        <p className="muted">
          Nhập tên subreddit rồi bấm Chạy. App sẽ gửi yêu cầu tới N8N để lấy nguồn; N8N xử lý phía
          sau và trả kết quả về đây.
        </p>
        <label>
          Tên subreddit
          <input
            value={subreddit}
            onChange={(e) => setSubreddit(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="vd: ItsAmazing"
            autoFocus
          />
        </label>
        <div className="row">
          <button className="primary" onClick={() => run(subreddit)} disabled={sending || !subreddit.trim()}>
            <Send size={16} className={sending ? 'spin' : ''} />
            {sending ? 'Đang gửi…' : 'Chạy'}
          </button>
          {result && (
            <span className={result.ok ? 'badge on' : 'badge off'}>
              {result.ok ? result.message ?? 'Thành công' : `Lỗi: ${result.error ?? 'Không rõ'}`}
            </span>
          )}
        </div>
      </section>

      {recents.length > 0 && (
        <section className="card">
          <h2>
            <History size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Gần đây
          </h2>
          <div className="chips">
            {recents.map((name) => (
              <button
                key={name}
                className="chip"
                onClick={() => pickRecent(name)}
                disabled={sending}
                title={`Chạy lại r/${name}`}
              >
                r/{name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Hướng dẫn</h2>
        <p className="muted">
          <Rss size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Event gửi đi cấu hình tại Cài đặt → Webhook N8N (mặc định <code>get_source</code>). Dữ liệu
          gửi kèm: <code>{'{ subreddit }'}</code>.
        </p>
      </section>
    </div>
  )
}
