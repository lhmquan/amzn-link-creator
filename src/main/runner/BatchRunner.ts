import { BrowserWindow } from 'electron'
import { IpcChannels, type ProgressPayload, type BatchSummary, type RowResult } from '../../shared/types'
import { getAllSettings } from '../db/settings'
import { insertLog, pruneLogs } from '../db/logs'
import { fetchRows, reportRow } from '../n8n/N8nConnector'
import { browserManager } from '../browser/BrowserManager'
import { processOne } from '../actions/AmazonActions'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Broadcast tiến trình tới mọi renderer window.
export function emitProgress(p: ProgressPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.taskProgress, p)
  }
}

let running = false
let stopRequested = false

export function isBatchRunning(): boolean {
  return running
}

export function stopBatch(): void {
  if (running) stopRequested = true
}

// Lấy URL Amazon từ dòng sheet theo tên cột cấu hình (thử cả biến thể hoa/thường).
function extractUrl(row: Record<string, unknown>, linkColumn: string): string | null {
  const direct = row[linkColumn]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  // Fallback: khớp không phân biệt hoa-thường.
  const lower = linkColumn.toLowerCase()
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) {
      const v = row[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return null
}

// Pipeline batch dùng chung cho nút "Bắt đầu".
export async function runBatch(): Promise<BatchSummary> {
  if (running) {
    return { ok: false, total: 0, okCount: 0, errCount: 0, error: 'Batch đang chạy rồi.' }
  }
  running = true
  stopRequested = false

  const settings = getAllSettings()
  let openedByUs = false
  let okCount = 0
  let errCount = 0
  let total = 0

  try {
    // 1. Lấy dữ liệu từ N8N.
    emitProgress({ stage: 'fetch', message: 'Đang lấy dữ liệu từ N8N…', busy: true })
    let rows
    try {
      rows = await fetchRows()
    } catch (e) {
      emitProgress({ stage: 'error', message: `Lỗi lấy dữ liệu: ${(e as Error).message}`, busy: false })
      return { ok: false, total: 0, okCount: 0, errCount: 0, error: (e as Error).message }
    }
    total = rows.length
    if (total === 0) {
      emitProgress({ stage: 'done', message: 'Không có dòng nào để xử lý.', busy: false })
      return { ok: true, total: 0, okCount: 0, errCount: 0 }
    }

    // 2. Mở profile (headless theo settings).
    emitProgress({ stage: 'open', message: 'Đang mở trình duyệt…', busy: true, total })
    let context = browserManager.getContext()
    if (!context) {
      context = await browserManager.openProfile({ headless: settings.headless, startUrl: 'about:blank' })
      openedByUs = true
    }

    // 3. Vòng lặp tuần tự qua các dòng.
    for (let i = 0; i < rows.length; i++) {
      if (stopRequested) {
        emitProgress({
          stage: 'done',
          message: `Đã dừng theo yêu cầu (xử lý ${i}/${total}).`,
          busy: false,
          current: i,
          total,
          okCount,
          errCount
        })
        return { ok: true, total, okCount, errCount, error: 'Dừng theo yêu cầu' }
      }

      const row = rows[i]
      const url = extractUrl(row, settings.linkColumn)
      emitProgress({
        stage: 'process',
        message: url ? `Đang xử lý: ${url}` : 'Dòng thiếu URL',
        busy: true,
        current: i + 1,
        total,
        okCount,
        errCount
      })

      let result: RowResult
      if (!url) {
        result = { ok: false, error: 'NO_URL', step: `Cột "${settings.linkColumn}" trống` }
      } else {
        try {
          result = await processOne(context, url, settings, (message) =>
            emitProgress({
              stage: 'process',
              message,
              busy: true,
              current: i + 1,
              total,
              okCount,
              errCount
            })
          )
        } catch (e) {
          result = { ok: false, error: 'EXCEPTION', step: (e as Error).message.slice(0, 120) }
        }
      }

      // 4. Báo kết quả về N8N + ghi nhật ký.
      const rep = await reportRow(row, result)
      insertLog({
        ts: Date.now(),
        ok: result.ok,
        url: url ?? null,
        affiliateLink: result.affiliateLink ?? null,
        caption: result.caption ?? null,
        error: result.ok
          ? rep.ok
            ? null
            : `report lỗi: ${rep.error}`
          : `${result.error ?? 'lỗi'}${result.step ? ` (${result.step})` : ''}${rep.ok ? '' : ` · report lỗi: ${rep.error}`}`,
        step: result.step ?? null
      })
      if (result.ok) okCount++
      else errCount++

      // 5. Delay giữa các dòng (trừ dòng cuối).
      if (i < rows.length - 1) await sleep(settings.rowDelayMs)
    }

    pruneLogs()
    emitProgress({
      stage: 'done',
      message: `Hoàn thành — ${okCount} thành công, ${errCount} lỗi (tổng ${total}).`,
      busy: false,
      current: total,
      total,
      okCount,
      errCount
    })
    return { ok: true, total, okCount, errCount }
  } finally {
    if (openedByUs) {
      await browserManager.closeProfile().catch(() => {})
    }
    running = false
    stopRequested = false
  }
}
