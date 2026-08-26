import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { chromium, type BrowserContext, type Page } from 'patchright'

// Thư mục profile chromium cố định (1 profile duy nhất cho toàn app).
export function getProfileDir(): string {
  return join(app.getPath('userData'), 'profile')
}

// Kích thước cửa sổ Chrome cho cả hai chế độ (đủ rộng để Amazon dựng giao diện desktop).
const WINDOW_WIDTH = 1440
const WINDOW_HEIGHT = 900

// Quản lý vòng đời 1 profile chromium (persistent context lưu session/cookie Amazon).
class BrowserManager {
  private context: BrowserContext | null = null
  // Context hiện tại đang chạy headless hay không (null = chưa mở). Dùng để biết có phải
  // mở lại Chrome khi batch cần chế độ khác với lúc user mở profile.
  private headlessMode: boolean | null = null
  private statusListeners = new Set<(open: boolean) => void>()

  isOpen(): boolean {
    return this.context !== null
  }

  onStatusChange(cb: (open: boolean) => void): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  private emitStatus(open: boolean): void {
    for (const cb of this.statusListeners) cb(open)
  }

  // Mở profile. opts.headless quyết định chế độ "chạy ngầm":
  //  - user bấm "Mở profile" -> false (cửa sổ hiện bình thường để đăng nhập Amazon).
  //  - chạy batch -> dùng settings.headless.
  //
  // Chạy ngầm dùng ĐÚNG Chrome headless: không cửa sổ, không icon taskbar, không Alt-Tab.
  // Đã thử hai cách khác và cả hai đều KHÔNG ẩn thật sự nên đã bỏ:
  //  - đẩy cửa sổ ra toạ độ âm: Chrome kẹp toạ độ (truyền -32000 thì báo về -26214) và
  //    cửa sổ vẫn còn trong taskbar lẫn Alt-Tab.
  //  - thu nhỏ (minimized): vẫn là cửa sổ thật nên vẫn có icon taskbar.
  // Headless từng bị nghi gây lỗi NO_POPOVER, nhưng nguyên nhân thật là phiên Associates
  // hết hạn. Đã đo lại khi phiên còn hạn: headless lấy được link y như headful
  // (/creators/links/render/ss trả 200, SiteStripe hydrate xong, popover mở).
  async openProfile(opts?: { headless?: boolean; startUrl?: string }): Promise<BrowserContext> {
    if (this.context) return this.context

    const profileDir = getProfileDir()
    mkdirSync(profileDir, { recursive: true })

    const headless = opts?.headless ?? false

    const launch = (): Promise<BrowserContext> =>
      chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless,
        // Headless: Chrome mặc định chỉ 762×484 (screen 800×600) — ép rộng cho khớp desktop.
        // Headful: viewport null để trang khớp kích thước cửa sổ thật.
        viewport: headless ? { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } : null,
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-infobars',
          '--test-type',
          // Bỏ bong bóng "Restore pages? Chrome didn't shut down correctly" — nó xuất hiện
          // khi tiến trình Chrome trước bị kill và che mất SiteStripe bar.
          '--hide-crash-restore-bubble',
          // Chrome LƯU vị trí cửa sổ vào profile (browser.window_placement trong
          // Default/Preferences). Luôn đặt lại vị trí để cửa sổ không kế thừa toạ độ cũ.
          '--window-position=0,0',
          // Đặt cả kích thước cửa sổ để screen.width/height khớp viewport (Amazon đọc các
          // giá trị này khi dựng layout).
          `--window-size=${WINDOW_WIDTH},${WINDOW_HEIGHT}`
        ]
      })

    // Profile có thể bị khóa bởi tiến trình Chrome cũ/zombie. Thử mở; nếu lỗi session
    // -> kill tiến trình đang giữ profile rồi retry đúng 1 lần.
    let context: BrowserContext
    try {
      context = await launch()
    } catch (e) {
      const msg = (e as Error).message ?? ''
      if (/existing browser session|already in use|profile/i.test(msg)) {
        killStaleChromeHolding(profileDir)
        context = await launch()
      } else {
        throw e
      }
    }

    context.on('close', () => {
      if (this.context === context) {
        this.context = null
        this.headlessMode = null
        this.emitStatus(false)
      }
    })

    // Cấp quyền clipboard. SiteStripe giao diện cũ ghi link vào clipboard qua nút
    // "Copy affiliate link", app đọc lại bằng navigator.clipboard.readText().
    // Cấp cho MỌI origin (không truyền origin) vì Amazon chuyển hướng qua nhiều tên miền
    // (www.amazon.com, smile.amazon.com, amazon.com…); nếu chỉ cấp 1 origin thì readText()
    // bị NotAllowedError trên các tên miền còn lại.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})

    this.context = context
    this.headlessMode = headless
    this.emitStatus(true)

    // Điều hướng tới trang khởi đầu (Amazon home để user đăng nhập). Lỗi điều hướng
    // không nên làm sập app.
    const startUrl = opts?.startUrl ?? 'https://www.amazon.com'
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})

    return context
  }

  // Đảm bảo context đang mở ĐÚNG chế độ yêu cầu. Trả về context dùng được.
  //
  // Cần thiết vì headless/headful là tham số lúc LAUNCH Chrome, không đổi được sau đó. Nếu
  // user bấm "Mở profile để đăng nhập" (luôn headful) rồi bấm "Bắt đầu" với "Chạy ngầm" đang
  // bật, context sẵn có là headful — trước đây batch dùng lại nó nên Chrome vẫn hiện. Giờ
  // đóng context cũ rồi mở lại đúng chế độ. Session/cookie nằm trong profile trên đĩa nên
  // đóng-mở không mất đăng nhập.
  async ensureMode(headless: boolean, startUrl?: string): Promise<BrowserContext> {
    if (this.context && this.headlessMode === headless) return this.context
    if (this.context) await this.closeProfile()
    return this.openProfile({ headless, startUrl })
  }

  getContext(): BrowserContext | null {
    return this.context
  }

  // Context đang mở có phải headless không (null = chưa mở Chrome).
  isHeadless(): boolean | null {
    return this.headlessMode
  }

  async closeProfile(): Promise<void> {
    const context = this.context
    if (!context) return
    this.context = null
    this.headlessMode = null
    this.emitStatus(false)
    await context.close().catch(() => {})
  }
}

export const browserManager = new BrowserManager()

// Kill tiến trình chrome.exe đang giữ profileDir (qua --user-data-dir). Chỉ nhắm đúng
// tiến trình dùng profile này, không động Chrome thường của user. Windows: wmic + taskkill.
function killStaleChromeHolding(profileDir: string): void {
  try {
    const normalized = profileDir.replace(/\\/g, '\\\\')
    const out = execSync(
      `wmic process where "name='chrome.exe' and CommandLine like '%--user-data-dir=${normalized}%'" get ProcessId /format:value`,
      { windowsHide: true, timeout: 8000 }
    ).toString()
    const pids = [...out.matchAll(/ProcessId=(\d+)/g)].map((m) => m[1]).filter(Boolean)
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { windowsHide: true, timeout: 5000 })
      } catch {
        /* ignore từng pid */
      }
    }
  } catch {
    /* wmic vắng / không có tiến trình -> bỏ qua */
  }
}
