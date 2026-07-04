import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { IpcChannels, type AppInfo } from '../shared/types'
import { registerIpc } from './ipc'
import { browserManager } from './browser/BrowserManager'
import { initUpdater, checkForUpdates, installUpdate } from './updater'
import { pruneLogs } from './db/logs'
import { createTray, getIsQuitting, setIsQuitting } from './tray'
import { getAutoStart, setAutoStart } from './autostart'

let mainWindow: BrowserWindow | null = null

// Icon app: khi đóng gói nằm trong resources; khi dev nằm ở build/.
function getAppIcon(): Electron.NativeImage | undefined {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')
  if (existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath)
  }
  return undefined
}

function createWindow(): BrowserWindow {
  const icon = getAppIcon()
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'AMZN LINK CREATOR',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Nhấn X = thu xuống tray (không thoát). Chỉ thoát thật khi isQuitting=true
  // (từ tray "Thoát", relaunch, update install).
  win.on('close', (e) => {
    if (!getIsQuitting()) {
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function registerAppIpc(): void {
  ipcMain.handle(IpcChannels.getAppInfo, (): AppInfo => {
    return { name: 'AMZN LINK CREATOR', version: app.getVersion() }
  })

  ipcMain.handle(IpcChannels.appRelaunch, async () => {
    setIsQuitting(true)
    await browserManager.closeProfile()
    if (!app.isPackaged || process.env['ELECTRON_RENDERER_URL']) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.reloadIgnoringCache()
      }
      return
    }
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle(IpcChannels.pickFolder, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle(IpcChannels.updateCheck, () => checkForUpdates())
  ipcMain.handle(IpcChannels.updateInstall, () => {
    setIsQuitting(true)
    installUpdate()
  })

  // Khởi động cùng Windows.
  ipcMain.handle(IpcChannels.autoStartGet, () => getAutoStart())
  ipcMain.handle(IpcChannels.autoStartSet, (_e, enabled: boolean) => setAutoStart(enabled))
}

app.whenReady().then(() => {
  registerAppIpc()
  registerIpc()

  mainWindow = createWindow()
  createTray(mainWindow)
  initUpdater()

  try {
    pruneLogs()
  } catch {
    /* ignore */
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
})

app.on('before-quit', async (e) => {
  // Đảm bảo đóng profile sạch trước khi thoát thật.
  setIsQuitting(true)
  if (browserManager.isOpen()) {
    e.preventDefault()
    await browserManager.closeProfile()
    app.quit()
  }
})

// KHÔNG tự quit khi tất cả cửa sổ đóng — app chạy nền trên tray.
// Chỉ quit khi user bấm "Thoát" từ tray (isQuitting=true).
app.on('window-all-closed', () => {
  // Windows/Linux: thu xuống tray, không quit. macOS: mặc định không quit.
})
