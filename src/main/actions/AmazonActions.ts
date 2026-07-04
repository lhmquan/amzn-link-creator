import type { BrowserContext, Page } from 'patchright'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { AppSettings, RowResult } from '../../shared/types'

// Callback báo tiến trình chi tiết của thao tác browser ra ngoài.
export type StepReporter = (message: string) => void
const noop: StepReporter = () => {}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function screenshotPath(prefix = 'row'): string {
  const dir = join(app.getPath('userData'), 'logs')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  return join(dir, `${prefix}_${Date.now()}.png`)
}

// ---- Selector SiteStripe (theo DOM thật của Enhanced Flow "T1") ----
// SiteStripe Bar phía trên trang (chỉ hiện khi đã đăng nhập Associates).
const SEL_SITESTRIPE_BAR = ['#amzn-ss-wrap', 'div[id^="amzn-ss-tracking"]', 'div[id^="amzn-ss-"]']
// Nút "Get Text" / "Get link" trên bar để mở popover Share affiliate link.
const SEL_GET_LINK = [
  '#amzn-ss-text-get-link-btn',
  '#amzn-ss-text-link',
  'a[id*="text-get-link" i]',
  'a[id*="get-link" i]'
]
// Popover "Share affiliate link" sau khi bấm Get Link.
const SEL_POPOVER = '.a-popover-content'
// Dropdown Tracking ID (select gốc).
const SEL_TRACKING_SELECT = '#amzn-ss-tracking-id-dropdown-text'
// Radio Short / Full (bấm vào span có data-action tương ứng).
const SEL_SHORT_RADIO = '[data-action="amzn-ss-get-link-shortlink"]'
const SEL_FULL_RADIO = '[data-action="amzn-ss-get-link-fulllink"]'
// Nút Copy affiliate link (ghi link vào clipboard).
const SEL_COPY_LINK = '#amzn-ss-copy-affiliate-link-btn-announce'
// Thông báo link tạo lỗi / sản phẩm bị loại khỏi chương trình.
const SEL_LINK_FAILURE = '.amzn-ss-popover-link-failure-message'
const SEL_EXCLUDED = '.amzn-ss-popover-third-party-message'
// Caption generator (expander).
const SEL_CAPTION_EXPANDER = '#amzn-clt-caption-ai-expander-heading'
const SEL_CAPTION_TEXTAREA = '#amzn-clt-caption-ai-textarea'
const SEL_CAPTION_SPINNER = '#amzn-clt-caption-ai-spinner'
const SEL_CAPTION_SAFETY = '#amzn-clt-caption-ai-safety-alert' // "Caption generator isn't available"
const SEL_CAPTION_COPY = '#amzn-clt-caption-ai-copy-btn-announce' // nút "Copy caption" -> clipboard

// Element có tồn tại + visible trong timeout không.
async function waitVisible(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
  return page
    .locator(`${selector}:visible`)
    .first()
    .waitFor({ timeout: timeoutMs, state: 'visible' })
    .then(() => true)
    .catch(() => false)
}

// Có ít nhất 1 element khớp không (không cần visible).
async function exists(page: Page, selector: string): Promise<boolean> {
  return (await page.locator(selector).count().catch(() => 0)) > 0
}

// Element có đang hiển thị (không display:none) không.
async function isShown(page: Page, selector: string): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false)
}

// Click bền: thử click thường -> force -> dispatchEvent.
async function robustClick(page: Page, selector: string): Promise<boolean> {
  const loc = page.locator(selector).first()
  if ((await loc.count().catch(() => 0)) === 0) return false
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
  try {
    await loc.click({ timeout: 5000 })
    return true
  } catch {
    try {
      await loc.click({ timeout: 3000, force: true })
      return true
    } catch {
      return loc
        .dispatchEvent('click')
        .then(() => true)
        .catch(() => false)
    }
  }
}

// Kiểm tra trang có phải trang lỗi Amazon (dog page / "Sorry" / 404).
async function isErrorPage(page: Page): Promise<boolean> {
  try {
    const title = (await page.title().catch(() => '')) || ''
    if (/sorry|page not found/i.test(title)) return true
    const bodyText = (await page
      .locator('body')
      .innerText({ timeout: 3000 })
      .catch(() => '')) as string
    return /sorry! something went wrong|the web address you entered is not a functioning page/i.test(
      bodyText
    )
  } catch {
    return false
  }
}

// Đọc clipboard qua page context (đã cấp quyền clipboard-read).
async function readClipboard(page: Page): Promise<string> {
  try {
    const text = (await page.evaluate(`navigator.clipboard.readText()`)) as string
    return (text ?? '').trim()
  } catch {
    return ''
  }
}

// Xử lý 1 dòng: mở link Amazon -> Get Link -> tracking/short/full -> copy link + caption.
export async function processOne(
  context: BrowserContext,
  url: string,
  settings: AppSettings,
  report: StepReporter = noop
): Promise<RowResult> {
  const page = context.pages()[0] ?? (await context.newPage())

  // 1. Điều hướng + kiểm tra link.
  report('Đang mở link Amazon…')
  try {
    const resp = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: settings.pageTimeoutMs
    })
    if (resp && resp.status() >= 400) {
      return { ok: false, error: 'BROKEN_LINK', step: `HTTP ${resp.status()}` }
    }
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (/timeout/i.test(msg)) return { ok: false, error: 'TIMEOUT', step: 'goto' }
    return { ok: false, error: 'BROKEN_LINK', step: `goto: ${msg.slice(0, 80)}` }
  }

  if (await isErrorPage(page)) {
    return { ok: false, error: 'BROKEN_LINK', step: 'error page' }
  }

  await sleep(settings.delayMs)

  // 2. Tìm SiteStripe Bar (chỉ hiện khi đã đăng nhập Associates).
  report('Đang tìm SiteStripe Bar…')
  let hasBar = false
  for (const sel of SEL_SITESTRIPE_BAR) {
    if (await exists(page, sel)) {
      hasBar = true
      break
    }
  }
  if (!hasBar) {
    return { ok: false, error: 'SITESTRIPE_NOT_FOUND', step: 'Chưa đăng nhập Associates?' }
  }

  // 3. Bấm Get Link để mở popover. Không có nút -> sản phẩm không hỗ trợ affiliate.
  report('Đang bấm Get Link…')
  let clickedGetLink = false
  for (const sel of SEL_GET_LINK) {
    if (await exists(page, sel)) {
      clickedGetLink = await robustClick(page, sel)
      if (clickedGetLink) break
    }
  }
  if (!clickedGetLink) {
    return { ok: false, error: 'NO_GET_LINK', step: 'Không thấy nút Get Link' }
  }

  // 4. Chờ popover "Share affiliate link" mở.
  const popoverOpen = await waitVisible(page, SEL_POPOVER, settings.pageTimeoutMs)
  if (!popoverOpen) {
    return { ok: false, error: 'NO_POPOVER', step: 'Popover không mở' }
  }
  await sleep(settings.delayMs)

  // 4b. Sản phẩm bị loại khỏi chương trình / link tạo lỗi.
  if (await isShown(page, SEL_EXCLUDED)) {
    return { ok: false, error: 'EXCLUDED_PRODUCT', step: 'Amazon Associates Excluded Product' }
  }
  if (await isShown(page, SEL_LINK_FAILURE)) {
    return { ok: false, error: 'LINK_GEN_FAILED', step: 'Unable to generate link' }
  }

  // 5. Chọn Tracking ID qua select (nếu cấu hình + có trong danh sách).
  if (settings.trackingId && (await exists(page, SEL_TRACKING_SELECT))) {
    report('Đang chọn Tracking ID…')
    const dd = page.locator(SEL_TRACKING_SELECT).first()
    const ok = await dd
      .selectOption(settings.trackingId)
      .then(() => true)
      .catch(() => false)
    if (!ok) {
      // Thử theo label nếu value không khớp.
      await dd.selectOption({ label: settings.trackingId }).catch(() => {})
    }
    await sleep(settings.delayMs)
  }

  // 6. Chọn Short/Full radio theo settings.
  const wantFull = settings.linkType === 'full'
  report(wantFull ? 'Chọn Full Link…' : 'Chọn Short Link…')
  await robustClick(page, wantFull ? SEL_FULL_RADIO : SEL_SHORT_RADIO)
  await sleep(settings.delayMs)

  // 7. Bấm "Copy affiliate link" -> link được ghi vào clipboard -> đọc lại.
  report('Đang copy affiliate link…')
  const copied = await robustClick(page, SEL_COPY_LINK)
  if (!copied) {
    return { ok: false, error: 'NO_COPY_BTN', step: 'Không thấy nút Copy affiliate link' }
  }
  await sleep(settings.delayMs)
  let affiliateLink = await readClipboard(page)
  // Retry đọc clipboard 1 lần (đôi khi ghi chậm).
  if (!affiliateLink) {
    await sleep(settings.delayMs)
    affiliateLink = await readClipboard(page)
  }
  if (!affiliateLink) {
    return { ok: false, error: 'NO_LINK_TEXT', step: 'Clipboard trống sau khi copy' }
  }

  // 8. Caption generator: mở expander -> chờ hết spinner -> bấm "Copy caption" -> đọc clipboard.
  report('Đang lấy caption…')
  let caption = ''
  if (await exists(page, SEL_CAPTION_EXPANDER)) {
    const expanded =
      (await page
        .locator(SEL_CAPTION_EXPANDER)
        .getAttribute('aria-expanded')
        .catch(() => null)) === 'true'
    if (!expanded) {
      await robustClick(page, SEL_CAPTION_EXPANDER)
    }
    await sleep(settings.delayMs)

    // Nếu caption không khả dụng cho sản phẩm này -> để trống, không coi là lỗi cả dòng.
    if (await isShown(page, SEL_CAPTION_SAFETY)) {
      caption = ''
    } else {
      // Chờ caption sinh xong: spinner tắt VÀ textarea có nội dung (tối đa pageTimeoutMs).
      const deadline = Date.now() + settings.pageTimeoutMs
      let ready = false
      while (Date.now() < deadline) {
        const spinning = await isShown(page, SEL_CAPTION_SPINNER)
        const val = (await page
          .locator(SEL_CAPTION_TEXTAREA)
          .first()
          .inputValue()
          .catch(() => '')) as string
        if (!spinning && val.trim()) {
          caption = val.trim()
          ready = true
          break
        }
        await sleep(600)
      }
      // Ưu tiên lấy caption qua nút "Copy caption" -> clipboard (đáng tin hơn đọc textarea).
      if (ready && (await exists(page, SEL_CAPTION_COPY))) {
        await robustClick(page, SEL_CAPTION_COPY)
        await sleep(settings.delayMs)
        const clip = await readClipboard(page)
        if (clip) caption = clip
      }
    }
  }

  return { ok: true, affiliateLink, caption }
}
