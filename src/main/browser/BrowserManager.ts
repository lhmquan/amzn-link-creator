import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { chromium, type BrowserContext } from 'patchright'

// Thư mục profile chromium cố định (1 profile duy nhất cho toàn app).
export function getProfileDir(): string {
  return join(app.getPath('userData'), 'profile')
}

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

  // Mở profile. headlessOverride (nếu truyền) quyết định chế độ hiển thị:
  //  - user bấm "Mở profile" -> false (headful, hiện cửa sổ để đăng nhập Amazon).
  //  - chạy batch -> dùng settings.headless.
  async openProfile(opts?: { headless?: boolean; startUrl?: string }): Promise<BrowserContext> {
    if (this.context) return this.context

    const profileDir = getProfileDir()
    mkdirSync(profileDir, { recursive: true })

    const headless = opts?.headless ?? false

    const launch = (): Promise<BrowserContext> =>
      chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless,
        viewport: null,
        args: ['--no-first-run', '--no-default-browser-check', '--disable-infobars', '--test-type']
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

    // Cấp quyền clipboard cho amazon.com — SiteStripe "Copy affiliate link" ghi link
    // vào clipboard, app đọc lại qua navigator.clipboard.readText().
    await context
      .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.amazon.com' })
      .catch(() => {})

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
