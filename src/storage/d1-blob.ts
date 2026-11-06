import { FileStorage, StoredFile } from './types';
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

/**
 * D1 儲存實作（base64 TEXT）
 *
 * 供「無檔案系統」的執行環境使用（例如部署到 Cloudflare Workers）。
 * 檔案內容以 base64 文字存於 D1 的 uploads 資料表。
 *
 * 為什麼不用 BLOB？
 *   D1 在將查詢結果序列化回應時，會把 BLOB 欄位轉成
 *   「逗號分隔的十進位數字字串」（例如 "137,80,78,13,..."），
 *   二進位內容因而失真。改存 base64 可完整往返，
 *   且 base64 為純 ASCII，不受編碼影響。
 */
export class D1BlobStorage implements FileStorage {
  constructor(private db: D1Database) {}

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    const encoded = arrayBufferToBase64(data);

    await this.db
      .prepare(
        `INSERT INTO uploads (key, content_type, data, size)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           content_type = excluded.content_type,
           data         = excluded.data,
           size         = excluded.size`
      )
      .bind(key, contentType, encoded, data.byteLength)
      .run();
  }

  async get(key: string): Promise<StoredFile | null> {
    const row = await this.db
      .prepare('SELECT content_type, data, size FROM uploads WHERE key = ?')
      .bind(key)
      .first<{ content_type: string; data: string; size: number }>();

    if (!row || !row.data) return null;

    let data: ArrayBuffer;
    try {
      data = base64ToArrayBuffer(row.data);
    } catch {
      return null;
    }

    return {
      key,
      contentType: row.content_type || 'application/octet-stream',
      size: row.size ?? data.byteLength,
      data,
    };
  }

  async delete(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM uploads WHERE key = ?').bind(key).run();
  }
}
