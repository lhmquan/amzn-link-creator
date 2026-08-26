import { getDb } from './index'
import { getAllSettings } from './settings'
import type { LogEntry, LogListParams, LogListResult } from '../../shared/types'

interface LogRow {
  id: number
  ts: number
  ok: number
  url: string | null
  affiliate_link: string | null
  caption: string | null
  product_title: string | null
  error: string | null
  step: string | null
}

function toLog(r: LogRow): LogEntry {
  return {
    id: r.id,
    ts: r.ts,
    ok: !!r.ok,
    url: r.url,
    affiliateLink: r.affiliate_link,
    caption: r.caption,
    productTitle: r.product_title ?? null,
    error: r.error,
    step: r.step
  }
}

export function insertLog(entry: Omit<LogEntry, 'id'>): void {
  getDb()
    .prepare(
      `INSERT INTO logs (ts, ok, url, affiliate_link, caption, product_title, error, step)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.ts,
      entry.ok ? 1 : 0,
      entry.url,
      entry.affiliateLink,
      entry.caption,
      entry.productTitle,
      entry.error,
      entry.step
    )
}

export function listLogs(params?: LogListParams): LogListResult {
  const page = Math.max(1, params?.page ?? 1)
  const pageSize = Math.max(1, Math.min(200, params?.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  const db = getDb()
  const total = (db.prepare('SELECT COUNT(*) as c FROM logs').get() as { c: number }).c
  const rows = db
    .prepare('SELECT * FROM logs ORDER BY ts DESC LIMIT ? OFFSET ?')
    .all(pageSize, offset) as LogRow[]
  return { rows: rows.map(toLog), total }
}

// Xoá log cũ hơn retentionDays.
export function pruneLogs(): void {
  const { logRetentionDays } = getAllSettings()
  if (!logRetentionDays || logRetentionDays <= 0) return
  const cutoff = Date.now() - logRetentionDays * 24 * 60 * 60 * 1000
  getDb().prepare('DELETE FROM logs WHERE ts < ?').run(cutoff)
}

export function clearLogs(): void {
  getDb().prepare('DELETE FROM logs').run()
}
