import type { FileStorage } from '../storage/types';

export interface Env {
  DB: D1Database;
  /**
   * 檔案儲存實作。
   * Node 本機執行時注入 LocalDiskStorage（寫入 uploads/ 資料夾）；
   * 未注入時自動退回 D1 BLOB 儲存。
   */
  STORAGE?: FileStorage;
  /**
   * Cloudflare 靜態資產綁定（Workers Static Assets）。
   * 提供於 wrangler.toml 的 [assets] 區塊，用於輸出前端 SPA。
   */
  ASSETS?: Fetcher;
  JWT_SECRET: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
  roleId: number;
  hierarchyLevel: number;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleId: number;
  hierarchyLevel: number;
  pinCode?: string;
}

/**
 * Hono App 環境型別：包含 D1 綁定、檔案儲存與 JWT 解出的使用者變數
 */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: JWTPayload;
  };
}
