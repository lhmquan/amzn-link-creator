import { ipcMain, BrowserWindow } from 'electron'
import { IpcChannels, type AppSettings, type LogListParams } from '../shared/types'
import { getAllSettings, saveSettings } from './db/settings'
import { listLogs, clearLogs } from './db/logs'
import { browserManager } from './browser/BrowserManager'
import { testWebhook } from './n8n/N8nConnector'
import { runBatch, stopBatch } from './runner/BatchRunner'

// Broadcast trạng thái browser (đóng cửa sổ thủ công…) tới renderer.
function emitBrowserStatus(open: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.browserStatusChanged, { open })
  }
}

export function registerIpc(): void {
  // ---- Settings ----
  ipcMain.handle(IpcChannels.settingsGet, () => getAllSettings())
  ipcMain.handle(IpcChannels.settingsSave, (_e, patch: Partial<AppSettings>) => saveSettings(patch))

  // ---- Browser (1 profile) ----
  // Nút "Mở profile": luôn headful để user đăng nhập Amazon.
  ipcMain.handle(IpcChannels.browserOpen, async () => {
    await browserManager.openProfile({ headless: false, startUrl: 'https://www.amazon.com' })
  })
  ipcMain.handle(IpcChannels.browserClose, async () => {
    await browserManager.closeProfile()
  })
  ipcMain.handle(IpcChannels.browserStatus, () => ({ open: browserManager.isOpen() }))

  // ---- Batch ----
  ipcMain.handle(IpcChannels.batchStart, () => runBatch())
  ipcMain.handle(IpcChannels.batchStop, () => {
    stopBatch()
  })

  // ---- Webhook test ----
  ipcMain.handle(IpcChannels.webhookTest, () => testWebhook())

  // ---- Logs ----
  ipcMain.handle(IpcChannels.logsList, (_e, params?: LogListParams) => listLogs(params))
  ipcMain.handle(IpcChannels.logsClear, () => {
    clearLogs()
    return undefined
  })

  // Bridge trạng thái browser từ manager -> renderer.
  browserManager.onStatusChange((open) => emitBrowserStatus(open))
}
