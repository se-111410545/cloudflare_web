-- ============================================
-- 本機檔案儲存遷移
--
-- 1. 欄位更名：image_r2_key -> image_key
--    （移除 R2 語意，統一為通用檔案鍵）
-- 2. 新增 uploads 資料表
--    （D1 BLOB 後備儲存方案，僅在無檔案系統的 Worker 環境使用）
-- ============================================

ALTER TABLE products RENAME COLUMN image_r2_key TO image_key;

CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  content_type TEXT,
  data BLOB,
  size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_uploads_key ON uploads(key);
