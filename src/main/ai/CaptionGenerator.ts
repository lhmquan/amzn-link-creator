// Sinh caption bằng AI qua API tương thích OpenAI (POST {baseUrl}/chat/completions).
// Amazon đã bỏ Caption Generator trên SiteStripe nên caption giờ do đây tạo ra, rồi
// BatchRunner gửi về N8N như cũ.
import type { AppSettings, AiTestResult } from '../../shared/types'
import { getAllSettings } from '../db/settings'

// Ngữ cảnh thay biến trong prompt của user.
export interface CaptionContext {
  title: string // tên sản phẩm bóc từ trang Amazon
  url?: string // link Amazon gốc của dòng
  link?: string // affiliate link đã tạo
}

// Ghép baseUrl + path, tự thêm '/v1' nếu user chỉ nhập host gốc.
// Chấp nhận: 'https://x/v1', 'https://x/v1/', 'https://x' (thêm /v1), và cả endpoint đầy đủ
// 'https://x/v1/chat/completions'. Query string được giữ lại (vd Azure: '?api-version=...').
export function buildChatUrl(baseUrl: string): string {
  const raw = baseUrl.trim()
  if (!raw) throw new Error('Chưa cấu hình Base URL của AI')

  // Tách query/hash ra để chỉ xử lý phần path, rồi gắn lại nguyên trạng.
  const qIdx = raw.search(/[?#]/)
  const head = qIdx === -1 ? raw : raw.slice(0, qIdx)
  const tail = qIdx === -1 ? '' : raw.slice(qIdx)

  const base = head.replace(/\/+$/, '')
  if (!base) throw new Error('Chưa cấu hình Base URL của AI')

  if (/\/chat\/completions$/i.test(base)) return base + tail
  if (/\/v\d+(?:beta)?$/i.test(base)) return `${base}/chat/completions${tail}`
  return `${base}/v1/chat/completions${tail}`
}

// Thay biến trong prompt: {title} {url} {link} {maxLength}. Biến không có dữ liệu -> chuỗi rỗng.
export function renderPrompt(template: string, ctx: CaptionContext, maxLength: number): string {
  return template
    .replace(/\{title\}/g, ctx.title ?? '')
    .replace(/\{url\}/g, ctx.url ?? '')
    .replace(/\{link\}/g, ctx.link ?? '')
    .replace(/\{maxLength\}/g, maxLength > 0 ? String(maxLength) : 'không giới hạn')
}

// Dọn caption AI trả về: bỏ khối ```…```, bỏ cặp nháy bao ngoài, chuẩn hoá khoảng trắng.
function cleanCaption(raw: string): string {
  let text = (raw ?? '').trim()
  const fence = text.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i)
  if (fence) text = fence[1].trim()
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith('“') && text.endsWith('”')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1).trim()
  }
  return text.replace(/[ \t]+\n/g, '\n').trim()
}

// Cắt caption về đúng giới hạn ký tự, ưu tiên cắt ở ranh giới từ để không đứt giữa chữ.
export function clampLength(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text
  const cut = text.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  // Chỉ lùi về khoảng trắng nếu không mất quá nhiều nội dung (>20% giới hạn).
  const trimmed = lastSpace > maxLength * 0.8 ? cut.slice(0, lastSpace) : cut
  return trimmed.trimEnd()
}

// Bóc nội dung text từ response chat/completions. Hỗ trợ cả content dạng mảng part
// (một số gateway tương thích OpenAI trả về kiểu này).
function extractContent(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const choices = (json as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0] as Record<string, unknown> | undefined
  const message = first?.message as Record<string, unknown> | undefined
  const content = message?.content

  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const t = (part as Record<string, unknown>).text
          if (typeof t === 'string') return t
        }
        return ''
      })
      .join('')
  }
  // Fallback kiểu completions cũ.
  if (typeof first?.text === 'string') return first.text as string
  return ''
}

// Lấy message lỗi từ body API (chuẩn OpenAI: { error: { message } }).
function extractApiError(body: string, status: number): string {
  try {
    const json = JSON.parse(body) as Record<string, unknown>
    const err = json.error
    if (typeof err === 'string') return `AI HTTP ${status}: ${err}`
    if (err && typeof err === 'object') {
      const msg = (err as Record<string, unknown>).message
      if (typeof msg === 'string' && msg.trim()) return `AI HTTP ${status}: ${msg.trim()}`
    }
    if (typeof json.message === 'string') return `AI HTTP ${status}: ${json.message}`
  } catch {
    /* body không phải JSON */
  }
  const isHtml = /^\s*<(?:!doctype|html)/i.test(body)
  if (isHtml) return `AI HTTP ${status} (máy chủ trả về trang HTML, không phải JSON)`
  return `AI HTTP ${status}${body ? ': ' + body.slice(0, 200) : ''}`
}

// Kết quả sinh caption: ok + caption, hoặc lỗi (không làm cả dòng thất bại).
export interface CaptionResult {
  ok: boolean
  caption?: string
  model?: string
  error?: string
}

// Gọi API AI sinh caption. Trả lỗi trong object thay vì throw để pipeline không đứt.
export async function generateCaption(
  ctx: CaptionContext,
  settingsOverride?: AppSettings
): Promise<CaptionResult> {
  const s = settingsOverride ?? getAllSettings()

  if (!s.aiApiKey.trim()) return { ok: false, error: 'Chưa cấu hình API Key của AI' }
  if (!s.aiModel.trim()) return { ok: false, error: 'Chưa cấu hình Model của AI' }
  if (!s.aiPrompt.trim()) return { ok: false, error: 'Chưa cấu hình Prompt của AI' }
  if (!ctx.title.trim()) return { ok: false, error: 'Không có tên sản phẩm để sinh caption' }

  let endpoint: string
  try {
    endpoint = buildChatUrl(s.aiBaseUrl)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const maxLength = Math.max(0, Math.floor(s.aiMaxLength))
  const prompt = renderPrompt(s.aiPrompt, ctx, maxLength)
  const system =
    maxLength > 0
      ? `Bạn là copywriter viết caption mạng xã hội. Chỉ trả về nội dung caption, không giải thích, không thêm dấu ngoặc kép. Caption phải dài tối đa ${maxLength} ký tự.`
      : 'Bạn là copywriter viết caption mạng xã hội. Chỉ trả về nội dung caption, không giải thích, không thêm dấu ngoặc kép.'

  // Hạn token đầu ra theo giới hạn ký tự (~1 token ≈ 2 ký tự cho tiếng Việt, cộng biên an toàn).
  const maxTokens = maxLength > 0 ? Math.min(2048, Math.max(64, Math.ceil(maxLength / 1.5))) : 1024

  const controller = new AbortController()
  const timeoutMs = s.aiTimeoutMs > 0 ? s.aiTimeoutMs : 60000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.aiApiKey.trim()}`
      },
      body: JSON.stringify({
        model: s.aiModel.trim(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    })

    const text = await res.text().catch(() => '')
    if (!res.ok) return { ok: false, error: extractApiError(text, res.status) }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, error: 'AI không trả JSON hợp lệ' }
    }

    const caption = clampLength(cleanCaption(extractContent(json)), maxLength)
    if (!caption) return { ok: false, error: 'AI trả về caption trống' }

    const model = (json as Record<string, unknown>).model
    return { ok: true, caption, model: typeof model === 'string' ? model : s.aiModel }
  } catch (e) {
    const err = e as Error
    if (err.name === 'AbortError') {
      return { ok: false, error: `AI quá thời gian chờ (${Math.round(timeoutMs / 1000)}s)` }
    }
    return { ok: false, error: `Lỗi gọi AI: ${err.message}` }
  } finally {
    clearTimeout(timer)
  }
}

// Tên sản phẩm mẫu dùng khi user bấm "Test AI" mà không nhập gì.
const SAMPLE_TITLE =
  'Anker Soundcore Life Q30 Hybrid Active Noise Cancelling Headphones, 40H Playtime, Bluetooth 5.0'

// Test cấu hình AI: gọi thật API với 1 tên sản phẩm mẫu để user thấy caption ra sao.
export async function testAi(sampleTitle?: string): Promise<AiTestResult> {
  const title = (sampleTitle ?? '').trim() || SAMPLE_TITLE
  const r = await generateCaption({ title })
  return r.ok
    ? { ok: true, caption: r.caption, model: r.model }
    : { ok: false, error: r.error ?? 'Lỗi không xác định' }
}
