import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { IpcChannels, type AppInfo } from '../shared/types'
import { registerIpc } from './ipc'
import { browserManager } from './browser/BrowserManager'
import { initUpdater, checkForUpdates, installUpdate } from './updater'
import { pruneLogs } from './db/logs'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'AMZN LINK CREATOR',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

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
  ipcMain.handle(IpcChannels.updateInstall, () => installUpdate())
}

app.whenReady().then(() => {
  registerAppIpc()
  registerIpc()

  mainWindow = createWindow()
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
  if (browserManager.isOpen()) {
    e.preventDefault()
    await browserManager.closeProfile()
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
