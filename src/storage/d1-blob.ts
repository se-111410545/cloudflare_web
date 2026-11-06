import { FileStorage, StoredFile } from './types';

/**
 * D1 BLOB 儲存實作
 *
 * 供「無檔案系統」的執行環境使用（例如部署到 Cloudflare Workers）。
 * 檔案內容存於 D1 的 uploads 資料表。
 */
export class D1BlobStorage implements FileStorage {
  constructor(private db: D1Database) {}

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO uploads (key, content_type, data, size)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           content_type = excluded.content_type,
           data         = excluded.data,
           size         = excluded.size`
      )
      .bind(key, contentType, data, data.byteLength)
      .run();
  }

  async get(key: string): Promise<StoredFile | null> {
    const row = await this.db
      .prepare('SELECT content_type, data, size FROM uploads WHERE key = ?')
      .bind(key)
      .first<{ content_type: string; data: ArrayBuffer; size: number }>();

    if (!row) return null;

    return {
      key,
      contentType: row.content_type || 'application/octet-stream',
      size: row.size ?? 0,
      data: row.data,
    };
  }

  async delete(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM uploads WHERE key = ?').bind(key).run();
  }
}
