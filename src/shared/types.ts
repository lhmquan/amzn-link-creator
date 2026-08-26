// Kiểu dữ liệu dùng chung giữa main / preload / renderer.

// Một dòng Google Sheet: object cột→giá trị. Giữ nguyên để trả lại N8N.
export type SheetRow = Record<string, unknown>

export interface AppSettings {
  webhookUrl: string // N8N endpoint (dùng cho cả fetch batch lẫn report)
  webhookSecret: string // gửi qua header X-Amzn-Secret
  fetchEvent: string // tên event khi gọi lấy dữ liệu (mặc định 'get_rows')
  reportEvent: string // tên event khi báo kết quả từng dòng (mặc định 'update_row')
  sourceEvent: string // tên event khi lấy nguồn từ subreddit (mặc định 'get_source')
  asinEvent: string // tên event khi bóc link gốc Amazon có ASIN (mặc định 'get_asin')
  linkColumn: string // tên cột chứa link Amazon trong dòng sheet (vd 'AmazonUrl')
  storeId: string // Store ID cần chọn/kiểm trên SiteStripe
  trackingId: string // Tracking ID cần chọn trên SiteStripe
  linkType: 'short' | 'full' // toggle cố định cho cả batch
  headless: boolean // chạy ngầm khi chạy batch (Chrome headless: không cửa sổ, không icon taskbar)
  delayMs: number // delay giữa các thao tác trên trang
  rowDelayMs: number // delay giữa các dòng
  pageTimeoutMs: number // timeout chờ trang Amazon load
  logRetentionDays: number // số ngày giữ nhật ký

  // ---- AI sinh caption (tương thích OpenAI) ----
  aiEnabled: boolean // bật/tắt sinh caption bằng AI
  aiBaseUrl: string // base URL API, vd 'https://api.openai.com/v1'
  aiModel: string // tên model, vd 'gpt-4o-mini'
  aiApiKey: string // Bearer token
  aiMaxLength: number // giới hạn số ký tự của caption (0 = không giới hạn)
  aiPrompt: string // prompt người dùng, hỗ trợ biến {title} {url} {link} {maxLength}
  aiTimeoutMs: number // timeout gọi API AI
}

// Biến được phép dùng trong aiPrompt (thay thế trước khi gửi cho AI).
export const AI_PROMPT_VARS = ['{title}', '{url}', '{link}', '{maxLength}'] as const

// Kết quả xử lý 1 dòng.
export interface RowResult {
  ok: boolean
  affiliateLink?: string
  caption?: string
  productTitle?: string // tên sản phẩm bóc từ trang Amazon (đầu vào cho AI)
  captionError?: string // lỗi riêng của bước sinh caption (không làm cả dòng thất bại)
  error?: string // mã lỗi ngắn gọn: BROKEN_LINK | NO_GET_LINK | SITESTRIPE_NOT_FOUND | TIMEOUT | NO_URL | ...
  step?: string
}

// Payload tiến trình broadcast tới renderer.
export interface ProgressPayload {
  stage: string // fetch | open | process | report | done | error | idle
  message: string
  busy: boolean
  current?: number // dòng hiện tại (1-based)
  total?: number // tổng số dòng
  okCount?: number
  errCount?: number
}

// Bản ghi nhật ký.
export interface LogEntry {
  id?: number
  ts: number
  ok: boolean
  url: string | null // link Amazon của dòng
  affiliateLink: string | null
  caption: string | null
  productTitle: string | null // tên sản phẩm đã bóc được
  error: string | null
  step: string | null
}

export interface LogListParams {
  page?: number
  pageSize?: number
}

export interface LogListResult {
  rows: LogEntry[]
  total: number
}

export interface WebhookTestResult {
  ok: boolean
  status?: number
  rowCount?: number
  error?: string
}

// Kết quả test cấu hình AI: gọi thật API với 1 tên sản phẩm mẫu.
export interface AiTestResult {
  ok: boolean
  caption?: string // caption AI trả về (đã cắt theo aiMaxLength)
  model?: string // model thực tế API báo lại
  error?: string
}

// Kết quả gửi yêu cầu "Lấy nguồn" (subreddit) — N8N xử lý phía sau rồi respond lại.
export interface SourceResult {
  ok: boolean
  count?: number // số nguồn N8N trả về xử lý được
  message?: string // thông báo N8N trả về (thành công/thất bại)
  error?: string
}

// Kết quả kích hoạt luồng "Get ASIN" — N8N bóc link gốc Amazon có ASIN từ dữ liệu reddit.
export interface AsinResult {
  ok: boolean
  count?: number // số ASIN/link N8N trả về xử lý được
  message?: string
  error?: string
}

export interface BatchSummary {
  ok: boolean
  total: number
  okCount: number
  errCount: number
  error?: string
}

export interface AppInfo {
  name: string
  version: string
}

export interface UpdateStatusPayload {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  message?: string
  version?: string
  percent?: number
}

// ---- IPC channels ----
export const IpcChannels = {
  getAppInfo: 'app:getInfo',
  appRelaunch: 'app:relaunch',
  pickFolder: 'app:pickFolder',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',

  browserOpen: 'browser:open',
  browserClose: 'browser:close',
  browserStatus: 'browser:status',
  browserStatusChanged: 'browser:statusChanged',

  batchStart: 'batch:start',
  batchStop: 'batch:stop',
  taskProgress: 'task:progress',

  webhookTest: 'webhook:test',

  aiTest: 'ai:test',

  sourceFetch: 'source:fetch',
  sourceRecents: 'source:recents',

  asinFetch: 'asin:fetch',

  logsList: 'logs:list',
  logsClear: 'logs:clear',

  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateStatus: 'update:status',

  autoStartGet: 'autostart:get',
  autoStartSet: 'autostart:set'
} as const

// ---- API expose qua preload (window.amzn) ----
export interface AmznApi {
  getAppInfo: () => Promise<AppInfo>
  relaunch: () => Promise<void>
  pickFolder: () => Promise<string | null>
  settings: {
    get: () => Promise<AppSettings>
    save: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  browser: {
    open: () => Promise<void>
    close: () => Promise<void>
    status: () => Promise<{ open: boolean }>
    onStatusChanged: (cb: (open: boolean) => void) => () => void
  }
  batch: {
    start: () => Promise<BatchSummary>
    stop: () => Promise<void>
    onProgress: (cb: (p: ProgressPayload) => void) => () => void
  }
  webhook: {
    test: () => Promise<WebhookTestResult>
  }
  ai: {
    test: (sampleTitle?: string) => Promise<AiTestResult>
  }
  source: {
    fetch: (subreddit: string) => Promise<SourceResult>
    recents: () => Promise<string[]>
  }
  asin: {
    fetch: () => Promise<AsinResult>
  }
  logs: {
    list: (params?: LogListParams) => Promise<LogListResult>
    clear: () => Promise<void>
  }
  update: {
    check: () => Promise<void>
    install: () => Promise<void>
    onStatus: (cb: (status: UpdateStatusPayload) => void) => () => void
  }
  autoStart: {
    get: () => Promise<boolean>
    set: (enabled: boolean) => Promise<void>
  }
}
