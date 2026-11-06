import { createApp } from './app';

/**
 * Cloudflare Worker 進入點
 *
 * 綁定 (wrangler.toml)：DB (D1)、JWT_SECRET
 * 若未注入 STORAGE，檔案儲存自動退回 D1 BLOB。
 */
const app = createApp();

export default app;
