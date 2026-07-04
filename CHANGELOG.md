# Changelog

Tất cả thay đổi đáng chú ý của AMZN LINK CREATOR được ghi tại đây.

## [0.2.0] - 2026-07-04

### Tính năng
- **Logo + icon** cho app (hiển thị ở cửa sổ + installer). SVG nguồn tại `build/icon.svg`, PNG 512x512 tại `build/icon.png`.
- **Nút cập nhật** trong tab Cài đặt: hiển thị phiên bản hiện tại, "Kiểm tra cập nhật", tải bản mới tự động, "Cài đặt & khởi động lại".
- **Cấu hình auto-update**: `build.publish` GitHub (`lhmquan/amzn-link-creator`) + electron-updater — cho phép `npm run release` phát hành bản cập nhật.

### Sửa lỗi
- Fix native module: thêm script `postinstall: electron-builder install-app-deps` để `better-sqlite3` rebuild đúng ABI Electron sau `npm install`.
- Automation SiteStripe theo DOM thật (Enhanced Flow T1): đọc affiliate link + caption qua nút Copy → clipboard; radio Short/Full; thêm mã lỗi `EXCLUDED_PRODUCT`, `LINK_GEN_FAILED`, `NO_POPOVER`, `NO_COPY_BTN`.

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
