# Changelog

Tất cả thay đổi đáng chú ý của AMZN LINK CREATOR được ghi tại đây.

## [0.5.3] - 2026-08-26

### Sửa lỗi
- **Phát hiện phiên Associates hết hạn thay vì báo `NO_POPOVER` mơ hồ**: SiteStripe Bar trên trang chỉ là vỏ HTML tĩnh do server render; toolbar và toàn bộ HTML popover được nạp sau bằng AJAX `GET /creators/links/render/ss` rồi nhét vào `#amzn-ss-dynamic-content` và `#amzn-ss-flyout-content`. Khi cookie Associates hết hạn, request này trả 302 về `/ap/signin` nên hai hộp đó rỗng mãi và nút "Get Link" KHÔNG có event listener nào (đã đo bằng CDP `DOMDebugger.getEventListeners`: 0 listener) — bấm bao nhiêu lần cũng không mở popover, trang cũng không hiện bất kỳ thông báo lỗi nào. App giờ theo dõi request này và báo `ASSOCIATES_SESSION_EXPIRED` kèm hướng dẫn bấm "Mở profile để đăng nhập".
- **Chờ SiteStripe nạp xong trước khi bấm "Get Link"**: thấy bar KHÔNG có nghĩa là dùng được. Không nạp xong trong `pageTimeoutMs` mà cũng không bị chuyển hướng đăng nhập thì báo `SITESTRIPE_NOT_READY`.
- **Chạy ngầm ẩn hoàn toàn trở lại**: dùng đúng Chrome headless — không cửa sổ, không icon dưới taskbar, không hiện khi Alt-Tab. Hai cách thử ở v0.5.2 đều KHÔNG ẩn thật: đẩy cửa sổ ra toạ độ âm thì Chrome kẹp toạ độ lại (truyền `-32000` báo về `-26214`) và cửa sổ vẫn còn trong taskbar; thu nhỏ (minimized) vẫn là cửa sổ thật nên vẫn có icon. Đã đo bằng cách đếm tiến trình Chrome có cửa sổ thật: headless = 0 cửa sổ, headful = 1 cửa sổ.
- **"Chạy ngầm" không còn bị vô hiệu sau khi mở profile để đăng nhập**: `headless` là tham số lúc launch Chrome, không đổi được sau đó, nhưng batch lại dùng lại context đang mở (luôn headful) nên cờ chạy ngầm bị bỏ qua — đây là lý do Chrome vẫn hiện dù đã tick "Chạy ngầm". Batch giờ mở lại Chrome đúng chế độ; session nằm trong profile trên đĩa nên không phải đăng nhập lại.

### Cải chính
- Kết luận ở v0.5.1 ("headless làm cửa sổ quá hẹp nên popover không mở") và ở v0.5.2 ("Amazon giới hạn tần suất tạo link") đều SAI. Nguyên nhân thật của `NO_POPOVER` là phiên Associates hết hạn. Đã đo lại khi phiên còn hạn: cả headless, headful, cửa sổ ngoài màn hình và cửa sổ thu nhỏ đều lấy được link như nhau. Thông báo lỗi không còn gợi ý tăng "Delay giữa các dòng" nữa.

### Cải tiến
- Bỏ bong bóng "Restore pages? Chrome didn't shut down correctly" (`--hide-crash-restore-bubble`) — nó xuất hiện sau khi tiến trình Chrome cũ bị kill và che mất SiteStripe Bar.

## [0.5.2] - 2026-08-26

### Sửa lỗi
- **Chạy ngầm không còn dùng Chrome headless**: thay vào đó mở Chrome thật rồi đẩy cửa sổ ra ngoài màn hình (`--window-position=-32000,-32000`) để user không thấy. Headless là một biến số dễ bị Amazon phân biệt (User-Agent chứa `HeadlessChrome`, `screen` chỉ 800×600), còn cách này chạy đúng Chrome bình thường nên hành vi khớp với lúc user tự mở cửa sổ.
- **Cửa sổ không còn "mất tích" sau khi chạy ngầm**: Chrome lưu vị trí cửa sổ vào profile (`browser.window_placement`), nên lần mở "Mở profile để đăng nhập" sau một lần chạy ngầm sẽ kế thừa toạ độ âm và nằm ngoài màn hình. App giờ luôn truyền `--window-position` cho cả hai chế độ.
- **Thử lại có nghỉ tăng dần khi popover không mở**: giữa 3 lần bấm "Get Link" có nghỉ 2s rồi 4s, thay vì bấm liên tiếp.

### Cải tiến
- **Thông báo lỗi NO_POPOVER nêu rõ nguyên nhân thường gặp**: Amazon giới hạn tần suất tạo link; khi bị siết thì bấm "Get Link" không mở popover và trang KHÔNG hiện bất kỳ thông báo lỗi nào. Đã đo: lúc đó cả chế độ hiện cửa sổ lẫn chạy ngầm đều thất bại như nhau. Cột lỗi trong Nhật ký giờ gợi ý tăng "Delay giữa các dòng" và chạy lại sau ít phút.

## [0.5.1] - 2026-08-26

### Sửa lỗi
- **Chạy ngầm (headless) luôn báo NO_POPOVER**: Chrome headless mặc định chỉ mở cửa sổ 762×484 (`screen` 800×600) — đã đo. Với chiều rộng đó Amazon dựng giao diện hẹp và popover "Share affiliate link" không mở, nên mọi dòng đều thất bại khi bật "Chạy ngầm" nhưng lại chạy tốt khi mở browser. Chế độ ngầm giờ dùng cửa sổ ảo 1440×900 (`viewport` + `--window-size` để `screen.width` cũng khớp). Chế độ hiện cửa sổ giữ nguyên `viewport: null` như trước.
- **Bấm Get Link có thử lại**: popover đôi khi không mở ở lần bấm đầu. App thử tối đa 3 lần, mỗi lần chờ ngắn (`pageTimeoutMs / 3`, tối thiểu 4 giây) thay vì chờ một lần thật lâu rồi bỏ dòng.

### Cải tiến
- **Lưu ảnh chụp + HTML khi thất bại**: lỗi `NO_POPOVER` / `NO_GET_LINK` giờ lưu ảnh chụp và HTML của trang vào thư mục `logs` trong app data, đường dẫn ảnh hiện ngay ở cột lỗi của Nhật ký — soi được Amazon thật sự đang hiện gì, kể cả khi chạy ngầm không nhìn thấy cửa sổ.

## [0.5.0] - 2026-08-26

### Thay đổi lớn
- **Bỏ hẳn Caption Generator của SiteStripe**: Amazon đã gỡ tính năng này khỏi popover "Share affiliate link". App không còn mở expander, chờ spinner hay bấm "Copy caption" nữa.
- **Sinh caption bằng AI (tương thích OpenAI)**: cấu hình trong Cài đặt → "AI sinh caption" gồm Base URL, Model, API Key, giới hạn độ dài caption, timeout và prompt tự do. Gọi `POST {baseUrl}/chat/completions` với header `Authorization: Bearer`; tự thêm `/v1` nếu chỉ nhập host và giữ nguyên query string. Mặc định TẮT để bản cũ chạy y như trước cho tới khi bạn cấu hình.
- **Biến trong prompt**: `{title}` tên sản phẩm bóc từ trang Amazon, `{url}` link Amazon gốc, `{link}` affiliate link vừa tạo, `{maxLength}` giới hạn ký tự.
- **Nút "Test AI"**: gọi thật API với tên sản phẩm mẫu (hoặc tên bạn tự nhập) và xem trước caption ngay trong Cài đặt, không cần chạy batch.
- **Bóc tên sản phẩm**: đọc `#productTitle` với các selector dự phòng, fallback cuối là `<title>` của trang (đã cắt tiền tố/hậu tố `Amazon.com`). Tên sản phẩm được gửi kèm về N8N (`productTitle`) và hiện trong cột "Sản phẩm" của Nhật ký.

### Sửa lỗi
- **Đứng hàng chục giây rồi bỏ qua dòng**: `page.evaluate` không có timeout mặc định, nên `navigator.clipboard.readText()` treo vô hạn khi cửa sổ Chrome mất focus (chế độ headful). Mọi thao tác clipboard giờ bọc timeout 3 giây.
- **Quyền clipboard cấp sai origin**: trước đây chỉ cấp cho `https://www.amazon.com`, nên `readText()` bị `NotAllowedError` khi Amazon chuyển hướng sang tên miền khác. Giờ cấp cho mọi origin của profile.
- **Mọi phép đọc DOM có timeout tường minh 2 giây**: Playwright mặc định chờ 30 giây khi selector không tồn tại (đã đo: `inputValue`, `getAttribute`, `isDisabled`, `selectOption` đều treo đúng 30.0s). SiteStripe đổi giao diện thường xuyên nên đây là nguồn treo chính.
- **Chống gán link của dòng trước**: ghi một giá trị mốc vào clipboard trước khi bấm "Copy affiliate link", chỉ nhận giá trị khác mốc và là URL `http(s)`. Trước đây nếu Copy thất bại, clipboard còn giữ link dòng trước và app gán sai link cho dòng hiện tại.
- **Bỏ qua clipboard sau 3 lần thất bại liên tiếp** trong cùng một lần chạy, chỉ đọc link trong ô text — tiết kiệm vài giây mỗi dòng.
- **Dừng sớm khi không có ô text**: `waitLinkInTextarea` thoát ngay nếu textarea không tồn tại thay vì quét hết timeout tải trang.

### Cải tiến
- **Lỗi AI không làm dòng thất bại**: caption lỗi được báo riêng qua `captionError`, dòng vẫn tính thành công và affiliate link vẫn được gửi về N8N. Nhật ký ghi cảnh báo "caption AI lỗi: …".
- **Nhật ký chi tiết hơn khi lấy link**: thêm các bước "Đang đặt mốc clipboard…", "Đang bấm Copy affiliate link…", "Đang đọc clipboard…" để biết chính xác kẹt ở đâu.
- **Payload gửi N8N thêm `productTitle` và `captionError`**; DB thêm cột `product_title` (migration idempotent, dữ liệu cũ giữ nguyên).

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
