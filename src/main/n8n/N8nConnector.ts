import type { SheetRow, RowResult, WebhookTestResult } from '../../shared/types'
import { getAllSettings } from '../db/settings'

// POST body webhook chung: có event để n8n rẽ nhánh.
function webhookBody(event: string, data: Record<string, unknown>): Record<string, unknown> {
  return { event, source: 'amzn-link-creator', ...data }
}

async function postWebhook(body: Record<string, unknown>): Promise<Response> {
  const { webhookUrl, webhookSecret } = getAllSettings()
  if (!webhookUrl) throw new Error('Chưa cấu hình Webhook URL trong Cài đặt')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (webhookSecret) headers['X-Amzn-Secret'] = webhookSecret
  return fetch(webhookUrl, { method: 'POST', headers, body: JSON.stringify(body) })
}

// Chuẩn hoá response fetch: chấp nhận mảng [...] hoặc { rows: [...] } / { data: [...] }.
function normalizeRows(raw: unknown): SheetRow[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is SheetRow => !!x && typeof x === 'object')
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const candidate = obj.rows ?? obj.data ?? obj.items
    if (Array.isArray(candidate)) {
      return candidate.filter((x): x is SheetRow => !!x && typeof x === 'object')
    }
    // Response là 1 object đơn -> coi như 1 dòng.
    return [obj]
  }
  return []
}

// Gọi N8N lấy danh sách dòng cần xử lý (event fetchEvent).
export async function fetchRows(): Promise<SheetRow[]> {
  const { fetchEvent } = getAllSettings()
  const res = await postWebhook(webhookBody(fetchEvent, {}))
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Webhook fetch HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`)
  }
  const json = await res.json().catch(() => {
    throw new Error('Webhook không trả JSON hợp lệ')
  })
  return normalizeRows(json)
}

// Báo kết quả 1 dòng về N8N (event reportEvent). Gửi kèm nguyên dòng gốc để N8N khớp
// đúng hàng sheet. ok=true kèm affiliateLink+caption; ok=false kèm error ngắn gọn.
export async function reportRow(
  row: SheetRow,
  result: RowResult
): Promise<{ ok: boolean; error?: string }> {
  const { reportEvent, linkType } = getAllSettings()
  try {
    const res = await postWebhook(
      webhookBody(reportEvent, {
        row,
        ok: result.ok,
        affiliateLink: result.affiliateLink ?? null,
        caption: result.caption ?? null,
        linkType,
        error: result.error ?? null
      })
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Webhook report HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Test webhook fetch — gọi thử event fetch, trả số dòng nhận được.
export async function testWebhook(): Promise<WebhookTestResult> {
  try {
    const rows = await fetchRows()
    return { ok: true, status: 200, rowCount: rows.length }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
