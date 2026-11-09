/**
 * PIN 查詢雜湊（lookup hash）
 *
 * 為什麼需要？
 *   bcrypt 使用隨機鹽，同一個 PIN 每次產生的雜湊都不同，
 *   無法用「WHERE pin_code = ?」直接索引查找。
 *   因此額外存一欄決定性雜湊（SHA-256）供快速定位候選使用者，
 *   真正的驗證仍以 bcrypt 為準。
 *
 * 安全性說明：
 *   - SHA-256 僅用於「找出是哪一位員工」，不作為驗證依據
 *   - 驗證必須通過 bcrypt.compare()
 *   - PIN 僅 4-6 位數，本就需要搭配帳號/來源限制；
 *     且此欄位僅存在於資料庫內，攻擊者需先取得 DB 才能利用
 *
 * 注意：scripts/ 下的種子與重設腳本會使用相同演算法，
 *       兩處實作必須一致（有測試驗證）。
 */
const PIN_LOOKUP_PREFIX = 'pos-pin:';

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 計算 PIN 的 lookup 雜湊 */
export async function pinLookup(pin: string): Promise<string> {
  return sha256Hex(PIN_LOOKUP_PREFIX + pin);
}
