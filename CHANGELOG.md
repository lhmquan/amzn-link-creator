# Changelog

Tất cả thay đổi đáng chú ý của AMZN LINK CREATOR được ghi tại đây.

## [0.4.1] - 2026-07-10

### Sửa lỗi
- **Bám theo giao diện SiteStripe mới**: giao diện mới bỏ nút "Copy affiliate link", link hiện sẵn trong ô textarea (`#amzn-ss-text-shortlink-textarea` / `#amzn-ss-text-fulllink-textarea`). App thử nút copy trước (giao diện cũ) rồi fallback đọc trực tiếp link trong textarea theo loại link đã chọn, chờ tới khi spinner tắt và value là URL.
- **Tạo lại link sau khi đổi Tracking ID**: đổi Tracking/Store ID khiến Amazon xoá link trong ô text và bật lại nút "Get Link" trong popover. App phát hiện thông báo update / nút Get Link được bật và bấm lại để sinh link mới trước khi đọc — khắc phục lỗi ô text bị clear trắng làm dòng bị treo rồi bỏ qua.

## [0.4.0] - 2026-07-05

### Tính năng
- **Tab "Lấy nguồn"**: nhập tên subreddit → gửi webhook N8N (event `get_source`, kèm `subreddit`); đọc respond để báo số nguồn lấy được. Nhớ danh sách subreddit gần đây (tối đa 10, lưu trong DB) để chọn lại nhanh bằng chip `r/<tên>`.
- **Tab "Get ASIN"**: bấm Chạy → gửi webhook N8N (event `get_asin`) kích hoạt luồng bóc link gốc Amazon có ASIN từ dữ liệu reddit; đọc respond để báo kết quả. Nhận dạng respond `[{ "success": true }]` là "N8N đã xử lý xong".
- **Cấu hình tên event mới** trong Cài đặt → Webhook N8N: "Tên event lấy nguồn" (`get_source`) và "Tên event Get ASIN" (`get_asin`).

### Cải tiến
- **Cài đặt delay/timeout đổi sang giây**: 3 ô Delay giữa thao tác / Delay giữa các dòng / Timeout tải trang giờ nhập bằng giây (bước 0.1s) cho dễ thiết lập; vẫn lưu ms bên dưới nên logic batch không đổi.
- **Thông báo lỗi webhook gọn hơn**: gặp timeout Cloudflare (524/504) hoặc body HTML thì hiện câu ngắn dễ hiểu thay vì đổ nguyên trang lỗi.

## [0.3.0] - 2026-07-04

### Tính năng
- **Nút cập nhật đưa ra sidebar**: nút "Kiểm tra cập nhật" / "Cài bản mới" + trạng thái + số phiên bản nằm ở chân thanh điều hướng, luôn nhìn thấy (không còn nằm trong tab Cài đặt).
- **Giao diện Sáng/Tối**: nút chuyển 3 chế độ (Theo hệ thống / Sáng / Tối) ở sidebar, lưu lựa chọn qua localStorage; theme "Theo hệ thống" tự đổi theo cài đặt Windows.
- **Khởi động cùng Windows**: toggle trong tab Cài đặt → Hệ thống (chỉ hiệu lực ở bản đã đóng gói).
- **Thu xuống khay hệ thống (tray)**: nhấn X = ẩn app vào tray thay vì thoát; chuột phải icon tray → "Hiện cửa sổ" / "Thoát". Thoát hẳn chỉ khi chọn "Thoát".
- **Cột Caption trong Nhật ký**: hiển thị caption đã lấy được cho từng dòng.

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
