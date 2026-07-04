import { app } from 'electron'

// Khởi động cùng Windows — dùng Electron built-in API. State nằm ở OS, không cần lưu DB.

export function getAutoStart(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

export function setAutoStart(enabled: boolean): void {
  // Ở chế độ dev (chưa đóng gói), app.getPath('exe') trỏ tới electron.exe trong
  // node_modules → nếu đăng ký sẽ bật Electron mặc định mỗi lần khởi động Windows.
  // Chỉ cho phép đặt auto-start khi đã đóng gói.
  if (!app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: false })
    return
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe')
  })
}
