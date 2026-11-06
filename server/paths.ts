import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * 本機開發環境路徑解析
 *
 * - 本地 D1：wrangler --local 建立的 SQLite 檔案
 *   （.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite）
 * - 檔案儲存：專案根目錄 uploads/
 */

export const PROJECT_ROOT = process.cwd();

/** 專案根目錄下的本機檔案儲存資料夾 */
export const UPLOAD_DIR = path.join(PROJECT_ROOT, 'uploads');

/**
 * 找出 wrangler 本地 D1 資料庫檔案。
 * 若尚未建立，拋出明確錯誤指引使用者先執行遷移。
 */
export function resolveLocalD1Path(): string {
  const stateDir = path.join(
    PROJECT_ROOT,
    '.wrangler',
    'state',
    'v3',
    'd1',
    'miniflare-D1DatabaseObject'
  );

  if (!existsSync(stateDir)) {
    throw new Error(
      [
        '找不到本地 D1 資料庫。',
        '',
        '請先在專案根目錄執行：',
        '  npm run db:migrate      # 建立 schema',
        '  npm run db:seed         # 匯入示範資料',
        '或一次到位：',
        '  npm run db:setup',
      ].join('\n')
    );
  }

  const sqliteFiles = readdirSync(stateDir).filter((f) => f.endsWith('.sqlite'));

  if (sqliteFiles.length === 0) {
    throw new Error(
      [
        '本地 D1 資料庫尚未初始化（目錄內找不到 .sqlite 檔案）。',
        '',
        '請先執行：',
        '  npm run db:migrate',
        '  npm run db:seed',
      ].join('\n')
    );
  }

  return path.join(stateDir, sqliteFiles[0]);
}
