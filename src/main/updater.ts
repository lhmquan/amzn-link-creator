import { BrowserWindow, app } from 'electron'
import electronUpdater from 'electron-updater'
import { IpcChannels, type UpdateStatusPayload } from '../shared/types'

const { autoUpdater } = electronUpdater

function broadcast(status: UpdateStatusPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.updateStatus, status)
  }
}

export function initUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ status: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => broadcast({ status: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ status: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ status: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) => broadcast({ status: 'error', message: err.message }))
}

export async function checkForUpdates(): Promise<void> {
  // Chỉ kiểm tra khi đã đóng gói (dev không có metadata update).
  if (!app.isPackaged) {
    broadcast({ status: 'not-available', message: 'Dev mode — không kiểm tra cập nhật.' })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    broadcast({ status: 'error', message: (e as Error).message })
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
