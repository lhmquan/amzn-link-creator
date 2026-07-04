import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

let tray: Tray | null = null

// Flag toàn cục: true khi app thực sự thoát (từ tray "Thoát", relaunch, update).
// Giúp phân biệt "nhấn X = thu tray" vs "thoát thật".
let isQuitting = false

export function getIsQuitting(): boolean {
  return isQuitting
}

export function setIsQuitting(v: boolean): void {
  isQuitting = v
}

// Icon tray — resize từ icon.png xuống 16x16.
function createTrayIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')
  if (existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  }
  // Fallback: chấm cam 16x16.
  const size = 16
  const pixels = Buffer.alloc(size * size * 4, 0)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      pixels[i] = 255
      pixels[i + 1] = 153
      pixels[i + 2] = 0
      pixels[i + 3] = 255
    }
  }
  return nativeImage.createFromBuffer(pixels, { width: size, height: size, scaleFactor: 1.0 })
}

export function createTray(mainWindow: BrowserWindow): void {
  if (tray) return

  tray = new Tray(createTrayIcon())
  tray.setToolTip('AMZN LINK CREATOR')

  // Click chuột trái → hiện cửa sổ.
  tray.on('click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `AMZN LINK CREATOR v${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      {
        label: 'Hiện cửa sổ',
        click: () => {
          mainWindow.show()
          mainWindow.focus()
        }
      },
      { type: 'separator' },
      {
        label: 'Thoát',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )

  // Đảm bảo isQuitting đúng khi quit từ nguồn khác (relaunch, update).
  app.on('before-quit', () => {
    if (!isQuitting) isQuitting = true
  })
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
