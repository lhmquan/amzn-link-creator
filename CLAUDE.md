# AMZN LINK CREATOR — Hard Rules cho Claude Code

App desktop tự động lấy affiliate link + caption từ Amazon SiteStripe, điều khiển bởi N8N/Google Sheet. Kiến trúc mô phỏng dự án Aviary (Electron + React + TS + electron-vite + patchright + better-sqlite3).

## 🔒 Bảo mật — KHÔNG thương lượng

### Dữ liệu CẤM commit lên git
| Loại | Lý do |
|------|-------|
| `*.db`, `*.sqlite`, `*.sqlite3` | DB SQLite chứa webhook secret, Store/Tracking ID, nhật ký. |
| `.env`, `.env.*` | Token/secret cấu hình runtime. |
| `*.pem`, `*.key`, `secrets.json` | Khóa riêng, secret. |
| `.claude/` | `settings.local.json` cache token & permission — RỦI RO CAO. |
| `data/profiles/` | Session/cookie Chromium (đăng nhập Amazon). |

### Quy trình commit BẮT BUỘC
1. KHÔNG dùng `git add -A` / `git add .` mù. Phải kiểm tra `git status` + `git diff --cached` trước khi commit.
2. Không bao giờ ghi token/secret/password thật vào source (dù comment, placeholder, hay test). Dùng env var hoặc file bị ignore.
3. Nếu vô tình thấy secret trong diff → DỪNG, báo user, không commit.
4. Token đã lộ (dán vào chat/commit) → báo user REVOKE ngay, không cố "xoá khỏi git".
5. Chỉ tạo commit khi user yêu cầu rõ ràng.

## 🏗️ Convention code
- Comment + UI bằng tiếng Việt.
- TypeScript strict: `npm run typecheck` phải sạch trước khi báo "xong".
- Reload KHÔNG rebuild main process: thay đổi main/preload → báo user tắt app mở lại.
- DB migration: dùng `addColumnIfMissing` / `CREATE TABLE IF NOT EXISTS` (idempotent).
- Pipeline batch: logic duy nhất ở `src/main/runner/BatchRunner.ts`. Nút "Bắt đầu" gọi hàm này.
- Nhật ký: mọi sự kiện (xử lý dòng, lỗi) ghi qua `insertLog`.

## 🔧 Lệnh thường dùng
```bash
npm run typecheck && npm run build   # kiểm tra + build (phải sạch)
npm run build:win                    # đóng gói Windows installer
```

## 🚀 Quy tắc "Up Version"
Khi user nói "Up Version": tổng hợp thay đổi từ tag cuối → bump version `package.json` → ghi changelog → typecheck+build sạch → commit (kiểm tra `git status`/`git diff --cached`, không commit secret/DB) → push. KHÔNG tự chạy `npm run release`.
