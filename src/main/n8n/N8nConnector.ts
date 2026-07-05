import type { SheetRow, RowResult, WebhookTestResult, SourceResult, AsinResult } from '../../shared/types'
import { getAllSettings, addRecentSubreddit } from '../db/settings'

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

// Gửi yêu cầu "Lấy nguồn" tới N8N: event sourceEvent + tên subreddit user nhập.
// N8N xử lý phía sau rồi respond lại; đọc message để báo cho user thành công/thất bại.
export async function fetchSource(subreddit: string): Promise<SourceResult> {
  const { sourceEvent } = getAllSettings()
  const name = subreddit.trim()
  if (!name) return { ok: false, error: 'Chưa nhập tên subreddit' }
  try {
    const res = await postWebhook(webhookBody(sourceEvent, { subreddit: name }))
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      return { ok: false, error: `Webhook HTTP ${res.status}${text ? ': ' + text.slice(0, 200) : ''}` }
    }

    // N8N trả về mảng các nguồn, hoặc object { ok, message } / { rows: [...] }, hoặc plain text.
    let count: number | undefined
    let message: string | undefined
    try {
      const json = JSON.parse(text) as unknown
      if (Array.isArray(json)) {
        count = json.length
      } else if (json && typeof json === 'object') {
        const obj = json as Record<string, unknown>
        if (obj.ok === false) {
          return { ok: false, error: String(obj.error ?? obj.message ?? 'N8N báo thất bại') }
        }
        const rows = obj.rows ?? obj.data ?? obj.items
        if (Array.isArray(rows)) count = rows.length
        if (typeof obj.count === 'number') count = obj.count
        if (typeof obj.message === 'string') message = obj.message
      }
    } catch {
      // không phải JSON -> giữ plain text làm message
      if (text.trim()) message = text.trim().slice(0, 200)
    }

    // Thành công -> nhớ subreddit vào danh sách gần đây.
    addRecentSubreddit(name)

    const finalMessage =
      message ??
      (count !== undefined
        ? `Đã lấy ${count} nguồn từ r/${name}`
        : `Đã gửi yêu cầu lấy nguồn r/${name}`)
    return { ok: true, count, message: finalMessage }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Kích hoạt luồng "Get ASIN" tại N8N: event asinEvent. N8N bóc link gốc Amazon có ASIN từ
// dữ liệu reddit rồi respond lại; đọc kết quả để báo cho user số lượng xử lý được.
export async function fetchAsin(): Promise<AsinResult> {
  const { asinEvent } = getAllSettings()
  try {
    const res = await postWebhook(webhookBody(asinEvent, {}))
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      return { ok: false, error: httpErrorMessage(res.status, text) }
    }

    // N8N thường trả [{ "success": true }] khi xong; cũng có thể trả mảng data,
    // object { ok/message/rows }, hoặc plain text.
    try {
      const json = JSON.parse(text) as unknown
      if (Array.isArray(json)) {
        // Mảng cờ trạng thái [{ success: true }] -> chỉ báo thành công, không đếm.
        if (isStatusFlagArray(json)) {
          return { ok: true, message: 'N8N đã xử lý xong' }
        }
        return { ok: true, count: json.length, message: `Đã bóc ${json.length} ASIN` }
      }
      if (json && typeof json === 'object') {
        const obj = json as Record<string, unknown>
        if (obj.ok === false || obj.success === false) {
          return { ok: false, error: String(obj.error ?? obj.message ?? 'N8N báo thất bại') }
        }
        const rows = obj.rows ?? obj.data ?? obj.items
        if (Array.isArray(rows)) return { ok: true, count: rows.length, message: `Đã bóc ${rows.length} ASIN` }
        if (typeof obj.count === 'number') return { ok: true, count: obj.count, message: `Đã bóc ${obj.count} ASIN` }
        if (typeof obj.message === 'string') return { ok: true, message: obj.message }
      }
    } catch {
      // không phải JSON
    }
    return { ok: true, message: 'N8N đã xử lý xong' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Mảng chỉ chứa cờ trạng thái, vd [{ success: true }] — không phải dữ liệu ASIN.
function isStatusFlagArray(arr: unknown[]): boolean {
  if (arr.length === 0) return true
  return arr.every(
    (x) => x && typeof x === 'object' && 'success' in (x as Record<string, unknown>)
  )
}

// Rút gọn lỗi HTTP: nếu body là HTML (vd trang lỗi Cloudflare) thì không đổ nguyên trang.
function httpErrorMessage(status: number, body: string): string {
  const isHtml = /^\s*<(?:!doctype|html)/i.test(body)
  if (status === 524) {
    return 'N8N đang xử lý quá lâu, kết nối chờ đã hết hạn (524). Luồng có thể vẫn đang chạy — kiểm tra lại kết quả trên N8N/Sheet sau ít phút.'
  }
  if (status === 504) {
    return 'Gateway hết thời gian chờ (504). N8N có thể vẫn đang xử lý — kiểm tra lại sau.'
  }
  if (isHtml) {
    return `Webhook HTTP ${status} (máy chủ trả về trang lỗi HTML, không phải JSON).`
  }
  return `Webhook HTTP ${status}${body ? ': ' + body.slice(0, 200) : ''}`
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
