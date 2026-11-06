import { D1BlobStorage } from './d1-blob';
import { FileStorage } from './types';

export * from './types';
export { D1BlobStorage } from './d1-blob';

/**
 * 取得檔案儲存實作
 *
 * 優先使用執行環境注入的 STORAGE（Node 本機執行時為 LocalDiskStorage），
 * 否則退回 D1 BLOB 儲存。
 */
export function createStorage(env: { DB: D1Database; STORAGE?: FileStorage }): FileStorage {
  if (env.STORAGE) return env.STORAGE;
  return new D1BlobStorage(env.DB);
}
