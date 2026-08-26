import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dir = join(app.getPath('userData'), 'db')
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'amzn.db'))
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ts             INTEGER NOT NULL,
      ok             INTEGER NOT NULL,
      url            TEXT,
      affiliate_link TEXT,
      caption        TEXT,
      error          TEXT,
      step           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs (ts);
  `)

  // Tên sản phẩm bóc từ trang Amazon (đầu vào cho AI sinh caption) — thêm cho DB cũ.
  addColumnIfMissing(d, 'logs', 'product_title', 'TEXT')
}

// Thêm cột nếu chưa có (idempotent, an toàn với DB cũ).
export function addColumnIfMissing(
  d: Database.Database,
  table: string,
  col: string,
  decl: string
): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === col)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`)
  }
}
