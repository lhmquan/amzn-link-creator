import type { BrowserContext, Page } from 'patchright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { AppSettings, RowResult } from '../../shared/types'

// Callback báo tiến trình chi tiết của thao tác browser ra ngoài.
export type StepReporter = (message: string) => void
const noop: StepReporter = () => {}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Timeout ngắn cho mọi phép ĐỌC thuộc tính DOM.
// Playwright mặc định chờ 30 giây khi element không tồn tại — đã đo: inputValue(),
// getAttribute(), isDisabled(), selectOption() đều treo đúng 30.0s trên selector thiếu.
// SiteStripe đổi giao diện là chuyện thường xuyên, nên KHÔNG được gọi các API này mà
// thiếu timeout tường minh, nếu không mỗi dòng sẽ đứng hàng chục giây.
const READ_TIMEOUT_MS = 2000
// Timeout cho thao tác clipboard. page.evaluate KHÔNG có timeout mặc định (đã đo: promise
// không resolve thì evaluate treo vô hạn), còn navigator.clipboard.readText() treo khi
// cửa sổ Chrome không được focus ở chế độ headful.
const CLIPBOARD_TIMEOUT_MS = 3000
// Số lần đọc clipboard thất bại liên tiếp thì bỏ cuộc (clipboard đang bị chặn hẳn).
const CLIPBOARD_MAX_FAILS = 3

export function screenshotPath(prefix = 'row'): string {
  const dir = join(app.getPath('userData'), 'logs')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  return join(dir, `${prefix}_${Date.now()}.png`)
}

// Lưu ảnh chụp + HTML của trang khi bước SiteStripe thất bại, để soi được thật sự
// Amazon đang hiện gì (nhất là lúc chạy ngầm, không nhìn thấy cửa sổ).
// Trả về đường dẫn ảnh để ghi vào step của nhật ký.
async function dumpFailure(page: Page, prefix: string): Promise<string> {
  const png = screenshotPath(prefix)
  await page.screenshot({ path: png, fullPage: false, timeout: 8000 }).catch(() => {})
  const html = png.replace(/\.png$/, '.html')
  const content = await page.content().catch(() => '')
  if (content) {
    try {
      writeFileSync(html, content, 'utf8')
    } catch {
      /* ignore */
    }
  }
  return png
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
// Hai hộp rỗng mà SiteStripe tự điền nội dung sau khi trang tải xong ("hydrate"):
// toolbar động và TOÀN BỘ HTML của các popover. Amazon trả chúng qua AJAX
// /creators/links/render/ss. Cả hai còn rỗng nghĩa là bar chỉ là vỏ tĩnh, nút Get Link
// KHÔNG có event listener nào -> bấm bao nhiêu lần cũng không mở được popover.
const SEL_SS_DYNAMIC = '#amzn-ss-dynamic-content'
const SEL_SS_FLYOUT = '#amzn-ss-flyout-content'
// Endpoint SiteStripe gọi để lấy toolbar + popover. Hết hạn đăng nhập Associates thì
// endpoint này trả 302 về /ap/signin nên trang không bao giờ hydrate.
const SS_RENDER_PATH = '/creators/links/render/ss'
// Dropdown Tracking ID (select gốc).
const SEL_TRACKING_SELECT = '#amzn-ss-tracking-id-dropdown-text'
// Radio Short / Full (bấm vào span có data-action tương ứng).
const SEL_SHORT_RADIO = '[data-action="amzn-ss-get-link-shortlink"]'
const SEL_FULL_RADIO = '[data-action="amzn-ss-get-link-fulllink"]'
// Nút Copy affiliate link (giao diện cũ — ghi link vào clipboard). Giao diện mới không còn nút này.
const SEL_COPY_LINK = '#amzn-ss-copy-affiliate-link-btn-announce'
// Nút "Get Link" BÊN TRONG popover: bật lại khi đổi Store/Tracking ID -> bấm để sinh lại link.
const SEL_INNER_GET_LINK = '#amzn-ss-get-link-btn-text-announce'
const SEL_INNER_GET_LINK_BOX = '#amzn-ss-get-link-btn-text' // span chứa class a-button-disabled khi nút bị khoá
// Thông báo "Bạn đã đổi Store/Tracking ID. Bấm Get Link để tạo link mới." (link textarea bị xoá).
const SEL_UPDATE_MSG = '#amzn-ss-txt-update-msg'
// Giao diện mới: link hiện sẵn trong textarea (short/full). Fallback đọc trực tiếp value.
const SEL_SHORT_TEXTAREA = '#amzn-ss-text-shortlink-textarea'
const SEL_FULL_TEXTAREA = '#amzn-ss-text-fulllink-textarea'
// Spinner khi Amazon đang sinh link trong textarea.
const SEL_LINK_SPINNER = '#amzn-ss-loading-spinner'
// Thông báo link tạo lỗi / sản phẩm bị loại khỏi chương trình.
const SEL_LINK_FAILURE = '.amzn-ss-popover-link-failure-message'
const SEL_EXCLUDED = '.amzn-ss-popover-third-party-message'
// Tên sản phẩm — dùng làm biến {title} cho prompt AI sinh caption.
// Amazon đã bỏ Caption Generator trên SiteStripe nên caption do AI của app sinh ra.
const SEL_PRODUCT_TITLE = [
  '#productTitle',
  '#title span#productTitle',
  'h1#title',
  '#titleSection #productTitle',
  'h1.product-title-word-break'
]

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
        .dispatchEvent('click', undefined, { timeout: READ_TIMEOUT_MS })
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

// Đọc clipboard qua page context. Bọc timeout vì page.evaluate không tự hết hạn và
// navigator.clipboard.readText() treo vô hạn khi cửa sổ Chrome mất focus (headful).
async function readClipboard(page: Page): Promise<string> {
  const read = page
    .evaluate(`navigator.clipboard.readText()`)
    .then((t) => ((t as string) ?? '').trim())
    .catch(() => '')
  const timeout = sleep(CLIPBOARD_TIMEOUT_MS).then(() => '')
  return Promise.race([read, timeout])
}

// Ghi 1 giá trị mốc vào clipboard để phát hiện nút Copy có thực sự ghi giá trị MỚI hay không.
// Không xoá mốc thì clipboard vẫn giữ link của dòng TRƯỚC, dễ gán link cũ cho dòng hiện tại.
async function writeClipboard(page: Page, value: string): Promise<boolean> {
  const write = page
    .evaluate(`navigator.clipboard.writeText(${JSON.stringify(value)})`)
    .then(() => true)
    .catch(() => false)
  const timeout = sleep(CLIPBOARD_TIMEOUT_MS).then(() => false)
  return Promise.race([write, timeout])
}

// Clipboard bị chặn (không focus / thiếu quyền) sau vài lần liên tiếp -> ngừng thử cho cả
// batch, chỉ dùng cách đọc link trong ô text. Tránh mỗi dòng mất thêm vài giây vô ích.
let clipboardFails = 0

// Cho phép còn thử clipboard nữa không.
function clipboardUsable(): boolean {
  return clipboardFails < CLIPBOARD_MAX_FAILS
}

// Đặt lại trạng thái clipboard khi bắt đầu batch mới (profile/cửa sổ có thể đã khác).
export function resetClipboardState(): void {
  clipboardFails = 0
}

// Bấm "Copy affiliate link" rồi đọc clipboard, có chống giá trị cũ (stale):
// ghi mốc trước khi bấm, sau đó chỉ nhận giá trị KHÁC mốc và là URL http(s).
async function copyLinkViaClipboard(
  page: Page,
  settings: AppSettings,
  report: StepReporter
): Promise<string> {
  const sentinel = `amzn-link-creator-sentinel-${Date.now()}`
  // Không ghi được mốc nghĩa là clipboard đang bị chặn -> khỏi bấm Copy cho nhanh.
  report('Đang đặt mốc clipboard…')
  if (!(await writeClipboard(page, sentinel))) {
    clipboardFails++
    report('Không ghi được clipboard — bỏ qua cách copy.')
    return ''
  }

  report('Đang bấm Copy affiliate link…')
  if (!(await robustClick(page, SEL_COPY_LINK))) return ''

  // Chờ Amazon ghi link vào clipboard. Giới hạn ngắn: đây chỉ là đường nhanh, đã có
  // fallback đọc ô text nên không được ngốn cả pageTimeoutMs ở đây.
  report('Đang đọc clipboard…')
  const deadline = Date.now() + Math.min(settings.pageTimeoutMs, CLIPBOARD_TIMEOUT_MS * 2)
  while (Date.now() < deadline) {
    const clip = await readClipboard(page)
    if (clip && clip !== sentinel && /^https?:\/\//i.test(clip)) {
      clipboardFails = 0
      return clip
    }
    await sleep(300)
  }

  clipboardFails++
  report('Clipboard không trả về link.')
  if (!clipboardUsable()) {
    report('Clipboard không dùng được — từ giờ chỉ đọc link trong ô text.')
  }
  return ''
}

// Đọc value của 1 textarea (dùng cho giao diện mới: link nằm sẵn trong ô text).
async function readTextareaValue(page: Page, selector: string): Promise<string> {
  const val = (await page
    .locator(selector)
    .first()
    .inputValue({ timeout: READ_TIMEOUT_MS })
    .catch(() => '')) as string
  return (val ?? '').trim()
}

// Chờ link xuất hiện trong textarea (spinner tắt + value là URL), tối đa timeoutMs.
// Dừng sớm nếu textarea không tồn tại: SiteStripe giao diện mới có thể không có ô text nào,
// khi đó vòng lặp chỉ tốn thời gian vô ích cho tới hết pageTimeoutMs.
async function waitLinkInTextarea(
  page: Page,
  selector: string,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await exists(page, selector))) return ''
    const spinning = await isShown(page, SEL_LINK_SPINNER)
    const val = await readTextareaValue(page, selector)
    if (!spinning && /^https?:\/\//i.test(val)) return val
    await sleep(400)
  }
  // Hết thời gian: trả value hiện có (có thể vẫn là URL kể cả khi vòng lặp lỡ nhịp).
  return readTextareaValue(page, selector)
}

// Nút "Get Link" trong popover có đang bật (clickable) không. Khi bị khoá: span box mang
// class a-button-disabled và button có attr disabled.
async function isInnerGetLinkEnabled(page: Page): Promise<boolean> {
  if (!(await exists(page, SEL_INNER_GET_LINK))) return false
  const boxClass =
    (await page
      .locator(SEL_INNER_GET_LINK_BOX)
      .first()
      .getAttribute('class', { timeout: READ_TIMEOUT_MS })
      .catch(() => '')) ?? ''
  if (/a-button-disabled/.test(boxClass)) return false
  const disabled = await page
    .locator(SEL_INNER_GET_LINK)
    .first()
    .isDisabled({ timeout: READ_TIMEOUT_MS })
    .catch(() => false)
  return !disabled
}

// Chờ SiteStripe hydrate: Amazon trả toolbar + HTML popover qua AJAX /creators/links/render/ss
// rồi nhét vào #amzn-ss-dynamic-content và #amzn-ss-flyout-content. Trước khi hydrate xong,
// bar chỉ là vỏ HTML tĩnh: nút "Get Link" KHÔNG có event listener nào (đã đo bằng CDP
// DOMDebugger.getEventListeners: 0 listener) nên bấm bao nhiêu lần cũng vô ích.
// Trả về true khi ít nhất một trong hai hộp đã có nội dung.
async function waitSiteStripeHydrated(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const filled = await page
      .evaluate(
        `(function(){
          var d = document.querySelector('${SEL_SS_DYNAMIC}');
          var f = document.querySelector('${SEL_SS_FLYOUT}');
          return (d ? d.innerHTML.length : 0) > 0 || (f ? f.innerHTML.length : 0) > 0;
        })()`
      )
      .catch(() => false)
    if (filled === true) return true
    await sleep(400)
  }
  return false
}

// Đọc tên sản phẩm trên trang chi tiết Amazon (biến {title} cho prompt AI).
// Thử lần lượt các selector; fallback cuối là <title> của trang (đã cắt hậu tố "- Amazon.com").
async function readProductTitle(page: Page): Promise<string> {
  for (const sel of SEL_PRODUCT_TITLE) {
    const text = (await page
      .locator(sel)
      .first()
      .innerText({ timeout: READ_TIMEOUT_MS })
      .catch(() => '')) as string
    const cleaned = (text ?? '').replace(/\s+/g, ' ').trim()
    if (cleaned) return cleaned
  }
  const docTitle = ((await page.title().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
  return docTitle
    .replace(/\s*[:|-]\s*Amazon\.[a-z.]+.*$/i, '')
    .replace(/^Amazon\.[a-z.]+\s*[:|-]\s*/i, '')
    .trim()
}

// Xử lý 1 dòng: mở link Amazon -> bóc tên sản phẩm -> Get Link -> tracking/short/full -> lấy link.
// Caption KHÔNG còn lấy từ SiteStripe (Amazon đã bỏ Caption Generator) — BatchRunner sẽ gọi AI
// sinh caption từ productTitle trả về ở đây.
export async function processOne(
  context: BrowserContext,
  url: string,
  settings: AppSettings,
  report: StepReporter = noop
): Promise<RowResult> {
  // Giữ tên sản phẩm ngoài luồng return để mọi nhánh lỗi vẫn báo được về N8N.
  const info: { productTitle: string } = { productTitle: '' }
  const result = await runOne(context, url, settings, report, info)
  return info.productTitle ? { ...result, productTitle: info.productTitle } : result
}

async function runOne(
  context: BrowserContext,
  url: string,
  settings: AppSettings,
  report: StepReporter,
  info: { productTitle: string }
): Promise<RowResult> {
  const page = context.pages()[0] ?? (await context.newPage())

  // Theo dõi AJAX /creators/links/render/ss của SiteStripe. Khi cookie Associates hết hạn,
  // endpoint này trả 302 về /ap/signin: bar vẫn hiện (vỏ tĩnh do server render) nhưng KHÔNG
  // bao giờ hydrate, nút Get Link không có listener nên bấm không mở popover và trang cũng
  // không hiện thông báo lỗi nào. Bắt tại đây để báo đúng lỗi thay vì NO_POPOVER mơ hồ.
  let ssRenderRedirected = false
  const onResponse = (resp: { url(): string; status(): number }): void => {
    if (!resp.url().includes(SS_RENDER_PATH)) return
    const status = resp.status()
    if (status >= 300 && status < 400) ssRenderRedirected = true
  }
  page.on('response', onResponse)
  try {
    return await runOneInner(page, url, settings, report, info, () => ssRenderRedirected)
  } finally {
    page.off('response', onResponse)
  }
}

async function runOneInner(
  page: Page,
  url: string,
  settings: AppSettings,
  report: StepReporter,
  info: { productTitle: string },
  ssRedirected: () => boolean
): Promise<RowResult> {

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

  // 1b. Bóc tên sản phẩm ngay khi trang vừa load (dùng cho prompt AI). Không có tên -> không
  // coi là lỗi dòng, AI sẽ nhận title rỗng và BatchRunner sẽ báo captionError.
  report('Đang đọc tên sản phẩm…')
  info.productTitle = await readProductTitle(page)

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

  // 2b. Chờ SiteStripe hydrate xong. Bar hiện KHÔNG có nghĩa là dùng được: phần vỏ do server
  // render sẵn, còn toolbar + popover được nhét vào sau bằng AJAX. Bấm trước khi hydrate thì
  // nút chưa có listener và popover không bao giờ mở.
  report('Đang chờ SiteStripe sẵn sàng…')
  const hydrated = await waitSiteStripeHydrated(page, settings.pageTimeoutMs)
  if (!hydrated) {
    const shot = await dumpFailure(page, 'ss_not_hydrated')
    // Nguyên nhân đã xác minh: cookie Associates hết hạn -> /creators/links/render/ss trả 302
    // về /ap/signin. Bar vẫn hiện nên không thể phát hiện bằng cách tìm bar.
    if (ssRedirected()) {
      return {
        ok: false,
        error: 'ASSOCIATES_SESSION_EXPIRED',
        step: `Phiên Associates đã hết hạn (Amazon chuyển ${SS_RENDER_PATH} về trang đăng nhập) — bấm "Mở profile để đăng nhập" và đăng nhập lại · ${shot}`
      }
    }
    return {
      ok: false,
      error: 'SITESTRIPE_NOT_READY',
      step: `SiteStripe không nạp xong toolbar/popover trong ${Math.round(settings.pageTimeoutMs / 1000)}s · ${shot}`
    }
  }

  // 3 + 4. Bấm Get Link để mở popover "Share affiliate link".
  // Popover đôi khi không mở ở lần bấm đầu (trang chưa gắn xong handler, hoặc lần bấm
  // trước đã toggle nó đóng lại). Thử tối đa 3 lần, mỗi lần chờ ngắn thay vì chờ một
  // lần thật lâu rồi bỏ dòng. Giữa các lần có nghỉ tăng dần (backoff) vì nguyên nhân
  // thường gặp là Amazon đang siết tần suất tạo link.
  const POPOVER_TRIES = 3
  const popoverWaitMs = Math.max(4000, Math.floor(settings.pageTimeoutMs / POPOVER_TRIES))
  let popoverOpen = false
  let clickedGetLink = false

  for (let attempt = 1; attempt <= POPOVER_TRIES && !popoverOpen; attempt++) {
    if (attempt > 1) {
      // Nghỉ tăng dần: 2s, 4s… rồi bấm lại.
      const backoffMs = 2000 * (attempt - 1)
      report(`Popover chưa mở — nghỉ ${Math.round(backoffMs / 1000)}s rồi thử lại…`)
      await sleep(backoffMs)
    }
    report(attempt === 1 ? 'Đang bấm Get Link…' : `Đang bấm Get Link (lần ${attempt})…`)

    let clickedThisTry = false
    for (const sel of SEL_GET_LINK) {
      if (await exists(page, sel)) {
        clickedThisTry = await robustClick(page, sel)
        if (clickedThisTry) break
      }
    }
    if (clickedThisTry) clickedGetLink = true
    if (!clickedGetLink) break // không có nút Get Link -> khỏi thử tiếp

    report('Đang chờ popover mở…')
    popoverOpen = await waitVisible(page, SEL_POPOVER, popoverWaitMs)
  }

  if (!clickedGetLink) {
    const shot = await dumpFailure(page, 'no_get_link')
    return { ok: false, error: 'NO_GET_LINK', step: `Không thấy nút Get Link · ${shot}` }
  }
  if (!popoverOpen) {
    const shot = await dumpFailure(page, 'no_popover')
    if (ssRedirected()) {
      return {
        ok: false,
        error: 'ASSOCIATES_SESSION_EXPIRED',
        step: `Phiên Associates đã hết hạn (Amazon chuyển ${SS_RENDER_PATH} về trang đăng nhập) — bấm "Mở profile để đăng nhập" và đăng nhập lại · ${shot}`
      }
    }
    return {
      ok: false,
      error: 'NO_POPOVER',
      step: `Popover không mở sau ${POPOVER_TRIES} lần bấm · ${shot}`
    }
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
      .selectOption(settings.trackingId, { timeout: READ_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false)
    if (!ok) {
      // Thử theo label nếu value không khớp.
      await dd
        .selectOption({ label: settings.trackingId }, { timeout: READ_TIMEOUT_MS })
        .catch(() => {})
    }
    await sleep(settings.delayMs)
  }

  // 6. Chọn Short/Full radio theo settings.
  const wantFull = settings.linkType === 'full'
  report(wantFull ? 'Chọn Full Link…' : 'Chọn Short Link…')
  await robustClick(page, wantFull ? SEL_FULL_RADIO : SEL_SHORT_RADIO)
  await sleep(settings.delayMs)

  // 6b. Sau khi đổi Tracking ID / Store ID, Amazon XOÁ link trong ô text và bật lại nút
  // "Get Link" bên trong popover (yêu cầu bấm để sinh link mới). Nếu thấy thông báo update
  // hoặc nút Get Link đã được bật -> bấm lại rồi chờ.
  const needRegen =
    (await isShown(page, SEL_UPDATE_MSG)) || (await isInnerGetLinkEnabled(page))
  if (needRegen) {
    report('Đang tạo lại link (đã đổi Tracking ID)…')
    await robustClick(page, SEL_INNER_GET_LINK)
    await sleep(settings.delayMs)
  }

  // 7. Lấy affiliate link.
  // Ưu tiên nút "Copy affiliate link" (giao diện cũ) -> đọc clipboard.
  // Giao diện mới không còn nút này: fallback đọc trực tiếp link trong textarea (short/full).
  report('Đang lấy affiliate link…')
  const linkTextarea = wantFull ? SEL_FULL_TEXTAREA : SEL_SHORT_TEXTAREA
  let affiliateLink = ''

  if (clipboardUsable() && (await exists(page, SEL_COPY_LINK))) {
    affiliateLink = await copyLinkViaClipboard(page, settings, report)
  }

  // Fallback (giao diện mới): đọc link trong ô textarea theo loại link đã chọn.
  if (!affiliateLink) {
    report('Đang đọc link trong ô text…')
    affiliateLink = await waitLinkInTextarea(page, linkTextarea, settings.pageTimeoutMs)
  }

  if (!affiliateLink) {
    return { ok: false, error: 'NO_LINK_TEXT', step: 'Không lấy được link (nút copy lẫn textarea)' }
  }

  // Caption do AI của app sinh ở BatchRunner, không lấy từ SiteStripe nữa.
  return { ok: true, affiliateLink }
}
