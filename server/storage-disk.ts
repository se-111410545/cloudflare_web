import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { FileStorage, StoredFile } from '../src/storage/types';

/**
 * 本機檔案儲存實作
 *
 * 檔案寫入專案根目錄的 uploads/ 資料夾。
 * 僅在 Node 執行環境使用（Cloudflare Worker 無檔案系統）。
 */
export class LocalDiskStorage implements FileStorage {
  constructor(private rootDir: string) {}

  /**
   * 解析檔案路徑，並防止路徑穿越（../）
   */
  private resolve(key: string): string {
    const normalized = path.normalize(key).replace(/^([/\\])+/, '');
    if (normalized.split(/[/\\]/).includes('..')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return path.join(this.rootDir, normalized);
  }

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(data));
  }

  async get(key: string): Promise<StoredFile | null> {
    const filePath = this.resolve(key);
    try {
      await stat(filePath);
    } catch {
      return null;
    }

    const buf = await readFile(filePath);
    const data = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength
    ) as ArrayBuffer;

    return {
      key,
      contentType: guessContentType(filePath),
      size: buf.byteLength,
      data,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    try {
      await unlink(filePath);
    } catch {
      // 檔案不存在時忽略
    }
  }
}

/** 依副檔名推斷 Content-Type */
function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
}
