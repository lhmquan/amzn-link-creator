# Changelog

Tất cả thay đổi đáng chú ý của AMZN LINK CREATOR được ghi tại đây.

## [0.1.0] - 2026-07-04

Phiên bản đầu tiên.

### Tính năng
- App desktop (Electron + React + TypeScript) tự động lấy affiliate link + caption từ Amazon SiteStripe, điều khiển bởi N8N/Google Sheet.
- **Một profile Chromium** (patchright anti-detect) lưu session đăng nhập Amazon Associates; nút "Mở profile" để đăng nhập thủ công.
- **Tích hợp N8N qua webhook**: gọi event lấy danh sách dòng (`get_rows`), báo kết quả từng dòng (`update_row`) kèm nguyên dòng gốc + affiliate link + caption hoặc mã lỗi. Secret gửi qua header `X-Amzn-Secret`.
- **Batch tuần tự**: mở từng link Amazon → SiteStripe → Get Link → chọn Tracking ID (dropdown) → Short/Full (radio) → Copy affiliate link (đọc qua clipboard) → Caption generator (Copy caption qua clipboard).
- **Xử lý lỗi từng dòng**: `BROKEN_LINK`, `TIMEOUT`, `SITESTRIPE_NOT_FOUND`, `NO_GET_LINK`, `EXCLUDED_PRODUCT`, `LINK_GEN_FAILED`, `NO_LINK_TEXT`, `NO_URL` — đều gửi về webhook để cập nhật sheet.
- **Cấu hình**: webhook URL/secret, tên 2 event, tên cột chứa link, Store/Tracking ID, loại link (short/full), chế độ chạy ngầm (headless), delay giữa thao tác/giữa dòng, timeout tải trang.
- **Giao diện**: tab Chạy (progress bar + console realtime), Cài đặt, Nhật ký (phân trang).
- Lưu cấu hình + nhật ký qua SQLite (better-sqlite3, WAL).
