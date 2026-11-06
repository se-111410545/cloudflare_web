/**
 * 檔案儲存抽象層
 *
 * 原本專案使用 Cloudflare R2 儲存商品圖片。
 * 現改為「本機檔案儲存」為主，並保留 D1 BLOB 作為無檔案系統環境（Cloudflare Worker 部署）的後備方案。
 *
 * 兩種實作皆符合本介面：
 *  - LocalDiskStorage  (server/storage-disk.ts)  本機 uploads/ 資料夾
 *  - D1BlobStorage     (src/storage/d1-blob.ts)  D1 uploads 資料表
 */
export interface StoredFile {
  key: string;
  contentType: string;
  size: number;
  data: ArrayBuffer;
}

export interface FileStorage {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}
