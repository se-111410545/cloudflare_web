-- ============================================
-- 憑證安全強化
--
-- 1. 舊版種子資料以明文存放 PIN 與密碼，立即失效
-- 2. 新增 pin_lookup 欄位
--    bcrypt 使用隨機鹽，無法用「WHERE pin_code = ?」索引查找，
--    故另存一欄決定性的 SHA-256 供快速定位候選使用者；
--    真正的驗證仍以 bcrypt 為準（見 src/lib/password.ts）。
-- ============================================

-- 明文 PIN 一律失效（合法 bcrypt 雜湊以 $2 開頭）
UPDATE users
SET pin_code = NULL
WHERE pin_code IS NOT NULL AND pin_code NOT LIKE '$2%';

-- 明文密碼置為不可能通過驗證的值（'!' 不是合法 bcrypt 雜湊）
UPDATE users
SET password_hash = '!'
WHERE password_hash IS NOT NULL AND password_hash NOT LIKE '$2%';

-- PIN 查詢欄位
ALTER TABLE users ADD COLUMN pin_lookup TEXT;

CREATE INDEX IF NOT EXISTS idx_users_pin_lookup ON users(pin_lookup);
