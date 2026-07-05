import { getDb } from './index'
import type { AppSettings } from '../../shared/types'

const DEFAULTS: AppSettings = {
  webhookUrl: '',
  webhookSecret: '',
  fetchEvent: 'get_rows',
  reportEvent: 'update_row',
  sourceEvent: 'get_source',
  asinEvent: 'get_asin',
  linkColumn: 'AmazonUrl',
  storeId: '',
  trackingId: '',
  linkType: 'short',
  headless: false,
  delayMs: 1500,
  rowDelayMs: 3000,
  pageTimeoutMs: 30000,
  logRetentionDays: 30
}

export function getAllSettings(): AppSettings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    webhookUrl: map.get('webhookUrl') ?? DEFAULTS.webhookUrl,
    webhookSecret: map.get('webhookSecret') ?? DEFAULTS.webhookSecret,
    fetchEvent: map.get('fetchEvent') ?? DEFAULTS.fetchEvent,
    reportEvent: map.get('reportEvent') ?? DEFAULTS.reportEvent,
    sourceEvent: map.get('sourceEvent') ?? DEFAULTS.sourceEvent,
    asinEvent: map.get('asinEvent') ?? DEFAULTS.asinEvent,
    linkColumn: map.get('linkColumn') ?? DEFAULTS.linkColumn,
    storeId: map.get('storeId') ?? DEFAULTS.storeId,
    trackingId: map.get('trackingId') ?? DEFAULTS.trackingId,
    linkType: map.get('linkType') === 'full' ? 'full' : DEFAULTS.linkType,
    headless: map.has('headless') ? map.get('headless') === 'true' : DEFAULTS.headless,
    delayMs: map.has('delayMs') ? Number(map.get('delayMs')) : DEFAULTS.delayMs,
    rowDelayMs: map.has('rowDelayMs') ? Number(map.get('rowDelayMs')) : DEFAULTS.rowDelayMs,
    pageTimeoutMs: map.has('pageTimeoutMs')
      ? Number(map.get('pageTimeoutMs'))
      : DEFAULTS.pageTimeoutMs,
    logRetentionDays: map.has('logRetentionDays')
      ? Number(map.get('logRetentionDays'))
      : DEFAULTS.logRetentionDays
  }
}

const RECENTS_KEY = 'sourceRecents'
const RECENTS_MAX = 10

// Danh sách subreddit gần đây (lưu JSON array trong bảng settings, mới nhất đứng đầu).
export function getRecentSubreddits(): string[] {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(RECENTS_KEY) as
    | { value: string }
    | undefined
  if (!row) return []
  try {
    const arr = JSON.parse(row.value)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Thêm 1 subreddit vào đầu danh sách gần đây (khử trùng không phân biệt hoa/thường).
export function addRecentSubreddit(name: string): string[] {
  const trimmed = name.trim()
  if (!trimmed) return getRecentSubreddits()
  const current = getRecentSubreddits().filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
  const next = [trimmed, ...current].slice(0, RECENTS_MAX)
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(RECENTS_KEY, JSON.stringify(next))
  return next
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = getDb().transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) stmt.run(k, v)
  })
  const entries = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)] as [string, string])
  tx(entries)
  return getAllSettings()
}
