import bcrypt from 'bcryptjs';

/**
 * 密碼 / PIN 雜湊工具
 *
 * 全部使用 bcrypt（bcryptjs 3.x 純 JS，Worker 環境可用，無原生編譯）。
 *
 * 安全重點：
 *   verifyPassword() 會先檢查是否為合法的 bcrypt 雜湊格式，
 *   舊版種子資料中「明文」存放的憑證一律視為無效，
 *   避免把資料庫內容當成密碼直接比對成功。
 */

/** bcrypt 雜湊格式：$2a$ / $2b$ / $2y$ + cost + salt + hash */
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** bcrypt 運算成本（10 為安全與效能的平衡點） */
const SALT_ROUNDS = 10;

/** 判斷字串是否為合法的 bcrypt 雜湊 */
export function isBcryptHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && BCRYPT_PATTERN.test(value);
}

/** 產生 bcrypt 雜湊 */
export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * 驗證明文與雜湊是否相符。
 *
 * 若儲存的並非 bcrypt 雜湊（例如舊版的明文密碼），
 * 一律回傳 false —— 絕不進行明文比對。
 */
export async function verifySecret(
  plain: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!plain || !isBcryptHash(hash)) return false;
  try {
    return await bcrypt.compare(plain, hash as string);
  } catch {
    return false;
  }
}

/**
 * 驗證 PIN。
 *
 * PIN 與密碼共用同一欄位語意（皆為 secrets），
 * 但 PIN 額外限制為純數字 4-6 碼，避免登入時被拿來猜測密碼。
 */
export async function verifyPin(
  pin: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin)) return false;
  return verifySecret(pin, hash);
}
