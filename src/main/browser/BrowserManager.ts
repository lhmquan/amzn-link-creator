import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { chromium, type BrowserContext } from 'patchright'

// Thư mục profile chromium cố định (1 profile duy nhất cho toàn app).
export function getProfileDir(): string {
  return join(app.getPath('userData'), 'profile')
}

// Kích thước cửa sổ Chrome cho cả hai chế độ (đủ rộng để Amazon dựng giao diện desktop).
const WINDOW_WIDTH = 1440
const WINDOW_HEIGHT = 900
// Toạ độ đẩy cửa sổ ra ngoài vùng nhìn thấy khi chạy ngầm. Chrome nhân toạ độ với device
// pixel ratio, nên dùng số rất lớn để chắc chắn nằm ngoài mọi màn hình.
const OFFSCREEN_X = -32000
const OFFSCREEN_Y = -32000

// Quản lý vòng đời 1 profile chromium (persistent context lưu session/cookie Amazon).
class BrowserManager {
  private context: BrowserContext | null = null
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
  // "Chạy ngầm" KHÔNG dùng Chrome headless mà mở Chrome thật rồi đẩy cửa sổ ra ngoài màn
  // hình. Lý do: headless là một biến số dễ bị Amazon phân biệt (User-Agent chứa
  // "HeadlessChrome"), trong khi cách này chạy đúng Chrome bình thường nên hành vi khớp
  // với lúc user tự mở cửa sổ. Đã đo: cả hai cách đều lấy được link.
  async openProfile(opts?: { headless?: boolean; startUrl?: string }): Promise<BrowserContext> {
    if (this.context) return this.context

    const profileDir = getProfileDir()
    mkdirSync(profileDir, { recursive: true })

    const offscreen = opts?.headless ?? false

    const launch = (): Promise<BrowserContext> =>
      chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        // Luôn headful — xem ghi chú ở trên.
        headless: false,
        // Chạy ngầm: cố định viewport để layout desktop ổn định dù cửa sổ ở ngoài màn hình.
        // Hiện cửa sổ: viewport null để trang khớp kích thước cửa sổ thật.
        viewport: offscreen ? { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } : null,
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-infobars',
          '--test-type',
          // Chrome LƯU vị trí cửa sổ vào profile (browser.window_placement trong
          // Default/Preferences). Nếu không đặt lại vị trí khi hiện cửa sổ, lần mở sau khi
          // chạy ngầm sẽ kế thừa toạ độ âm và cửa sổ nằm ngoài màn hình — user không thấy
          // để đăng nhập. Vì vậy LUÔN truyền --window-position cho cả hai chế độ.
          offscreen
            ? `--window-position=${OFFSCREEN_X},${OFFSCREEN_Y}`
            : '--window-position=0,0',
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
    this.emitStatus(true)

    // Điều hướng tới trang khởi đầu (Amazon home để user đăng nhập). Lỗi điều hướng
    // không nên làm sập app.
    const startUrl = opts?.startUrl ?? 'https://www.amazon.com'
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {})

    return context
  }

  getContext(): BrowserContext | null {
    return this.context
  }

  async closeProfile(): Promise<void> {
    const context = this.context
    if (!context) return
    this.context = null
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
