import { serve } from '@hono/node-server';
import { createApp } from '../src/app';
import { createLocalD1 } from './d1-local';
import { LocalDiskStorage } from './storage-disk';
import { resolveLocalD1Path, UPLOAD_DIR } from './paths';
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * 載入 .env（JWT_SECRET、ALLOW_REMOTE_ADMIN 等）
 * 已存在的 process.env 值優先，方便 CI 覆寫。
 */
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = value;
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production';
const ALLOW_REMOTE_ADMIN = process.env.ALLOW_REMOTE_ADMIN ?? 'false';

const dbPath = resolveLocalD1Path();
const db = createLocalD1(dbPath);
const storage = new LocalDiskStorage(UPLOAD_DIR);

const app = createApp();

const env = {
  DB: db as unknown as D1Database,
  STORAGE: storage,
  ALLOW_REMOTE_ADMIN,
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
    console.log(`  ➜  遠端管理寫入: ${ALLOW_REMOTE_ADMIN === 'true' ? '已允許' : '封鎖（本機完整可用）'}`);
    console.log('');
  }
);
