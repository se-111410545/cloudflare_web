-- ============================================
-- uploads 改用 base64 TEXT 儲存
--
-- D1 在將查詢結果序列化回應時，會把 BLOB 欄位轉成
-- 「逗號分隔的十進位數字字串」（例如 "137,80,78,13,..."），
-- 導致二進位內容失真（下載回來的檔案大小與內容都不正確）。
--
-- 改為存放 base64 字串：純 ASCII、可完整往返、不受編碼影響。
-- ============================================

ALTER TABLE uploads RENAME TO uploads_legacy;

CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  content_type TEXT,
  data TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_uploads_key ON uploads(key);

-- 舊資料若為 BLOB，CAST 會保留原始位元組；建議重新上傳以確保正確
INSERT OR IGNORE INTO uploads (key, content_type, data, size, created_at)
SELECT key, content_type, CAST(data AS TEXT), size, created_at
FROM uploads_legacy;

DROP TABLE IF EXISTS uploads_legacy;
