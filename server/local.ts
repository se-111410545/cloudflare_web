import { serve } from '@hono/node-server';
import { createApp } from '../src/app';
import { createLocalD1 } from './d1-local';
import { LocalDiskStorage } from './storage-disk';
import { resolveLocalD1Path, UPLOAD_DIR } from './paths';

/**
 * 本機開發伺服器（Node 執行環境）
 *
 * 為什麼需要這個？
 *   Cloudflare Worker 的執行環境（workerd）沒有檔案系統，
 *   `node:fs` 與靜態資產寫入都不被支援（已實測確認）。
 *   因此要讓「檔案上傳到本機 uploads/ 資料夾」真正運作，
 *   後端必須在 Node.js 上執行。
 *
 * 優點：
 *   - 本機檔案儲存可用（uploads/）
 *   - 直接開啟 wrangler --local 建立的同一份 SQLite 資料庫，
 *     所以 `npm run db:migrate` 匯入的資料這裡讀得到
 *   - 完全離線，不需要連線 Cloudflare
 */

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production';

const dbPath = resolveLocalD1Path();
const db = createLocalD1(dbPath);
const storage = new LocalDiskStorage(UPLOAD_DIR);

const app = createApp();

const env = {
  DB: db as unknown as D1Database,
  STORAGE: storage,
  JWT_SECRET,
};

serve(
  {
    // @hono/node-server 的 ctx 型別為 HttpBindings，與 Workers 的 ExecutionContext 不同，
    // 此處轉型以沿用 Hono app.fetch(request, env, ctx) 的標準呼叫形式。
    fetch: (request, ctx) =>
      app.fetch(request, env, ctx as unknown as ExecutionContext),
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    console.log('');
    console.log('  POS API (本機模式) 已啟動');
    console.log(`  ➜  URL:    http://${info.address}:${info.port}`);
    console.log(`  ➜  健康檢查: http://${info.address}:${info.port}/health`);
    console.log(`  ➜  D1:     ${dbPath}`);
    console.log(`  ➜  上傳目錄: ${UPLOAD_DIR}`);
    console.log('');
  }
);
