import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import type { LogEntry } from '@shared/types'

export default function LogsView(): JSX.Element {
  const [rows, setRows] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const load = useCallback(async (): Promise<void> => {
    const r = await window.amzn.logs.list({ page, pageSize })
    setRows(r.rows)
    setTotal(r.total)
  }, [page])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const clear = async (): Promise<void> => {
    if (!confirm('Xoá toàn bộ nhật ký?')) return
    await window.amzn.logs.clear()
    setPage(1)
    await load()
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="view">
      <h1>Nhật ký</h1>
      <div className="row">
        <button onClick={() => load()}>
          <RefreshCw size={16} /> Làm mới
        </button>
        <button className="danger" onClick={clear}>
          <Trash2 size={16} /> Xoá tất cả
        </button>
        <span className="muted">{total} bản ghi</span>
      </div>

      <table className="logs-table">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Trạng thái</th>
            <th>Link Amazon</th>
            <th>Affiliate / Lỗi</th>
            <th>Caption</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted">
                Chưa có nhật ký.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.ts).toLocaleString('vi-VN')}</td>
                <td>
                  <span className={r.ok ? 'badge on' : 'badge off'}>{r.ok ? 'OK' : 'Lỗi'}</span>
                </td>
                <td className="truncate" title={r.url ?? ''}>
                  {r.url ?? '—'}
                </td>
                <td className="truncate" title={r.ok ? r.affiliateLink ?? '' : r.error ?? ''}>
                  {r.ok ? r.affiliateLink ?? '—' : r.error ?? '—'}
                </td>
                <td className="truncate" title={r.caption ?? ''}>
                  {r.caption ?? '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="row">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Trước
          </button>
          <span className="muted">
            Trang {page}/{totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau →
          </button>
        </div>
      )}
    </div>
  )
}
