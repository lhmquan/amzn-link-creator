import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannels,
  type AmznApi,
  type AppSettings,
  type ProgressPayload,
  type LogListParams,
  type UpdateStatusPayload
} from '../shared/types'

const api: AmznApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  relaunch: () => ipcRenderer.invoke(IpcChannels.appRelaunch),
  pickFolder: () => ipcRenderer.invoke(IpcChannels.pickFolder),
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    save: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IpcChannels.settingsSave, patch)
  },
  browser: {
    open: () => ipcRenderer.invoke(IpcChannels.browserOpen),
    close: () => ipcRenderer.invoke(IpcChannels.browserClose),
    status: () => ipcRenderer.invoke(IpcChannels.browserStatus),
    onStatusChanged: (cb) => {
      const listener = (_e: unknown, data: { open: boolean }): void => cb(data.open)
      ipcRenderer.on(IpcChannels.browserStatusChanged, listener)
      return () => ipcRenderer.removeListener(IpcChannels.browserStatusChanged, listener)
    }
  },
  batch: {
    start: () => ipcRenderer.invoke(IpcChannels.batchStart),
    stop: () => ipcRenderer.invoke(IpcChannels.batchStop),
    onProgress: (cb) => {
      const listener = (_e: unknown, p: ProgressPayload): void => cb(p)
      ipcRenderer.on(IpcChannels.taskProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.taskProgress, listener)
    }
  },
  webhook: {
    test: () => ipcRenderer.invoke(IpcChannels.webhookTest)
  },
  source: {
    fetch: (subreddit: string) => ipcRenderer.invoke(IpcChannels.sourceFetch, subreddit),
    recents: () => ipcRenderer.invoke(IpcChannels.sourceRecents)
  },
  asin: {
    fetch: () => ipcRenderer.invoke(IpcChannels.asinFetch)
  },
  logs: {
    list: (params?: LogListParams) => ipcRenderer.invoke(IpcChannels.logsList, params),
    clear: () => ipcRenderer.invoke(IpcChannels.logsClear)
  },
  update: {
    check: () => ipcRenderer.invoke(IpcChannels.updateCheck),
    install: () => ipcRenderer.invoke(IpcChannels.updateInstall),
    onStatus: (cb: (status: UpdateStatusPayload) => void) => {
      const listener = (_e: unknown, status: UpdateStatusPayload): void => cb(status)
      ipcRenderer.on(IpcChannels.updateStatus, listener)
      return () => ipcRenderer.removeListener(IpcChannels.updateStatus, listener)
    }
  },
  autoStart: {
    get: () => ipcRenderer.invoke(IpcChannels.autoStartGet),
    set: (enabled: boolean) => ipcRenderer.invoke(IpcChannels.autoStartSet, enabled)
  }
}

contextBridge.exposeInMainWorld('amzn', api)
