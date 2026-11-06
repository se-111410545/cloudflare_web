import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

/**
 * 本機開發環境路徑解析
 *
 * - 本地 D1：wrangler --local 建立的 SQLite 檔案
 *   （.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite）
 * - 檔案儲存：專案根目錄 uploads/
 */

export const PROJECT_ROOT = process.cwd();

/** 專案根目錄下的本機檔案儲存資料夾 */
export const UPLOAD_DIR = path.join(PROJECT_ROOT, 'uploads');

/** 遷移腳本寫入的指標檔，記錄目前 database_id 對應的 SQLite 檔 */
const POINTER_FILE = path.join(PROJECT_ROOT, '.wrangler', 'local-db.json');

/** wrangler 本機 D1 狀態目錄 */
const D1_STATE_DIR = path.join(
  PROJECT_ROOT,
  '.wrangler',
  'state',
  'v3',
  'd1',
  'miniflare-D1DatabaseObject'
);

/** 判斷某個 SQLite 檔是否含有本專案的 schema */
function hasPosSchema(sqlitePath: string): boolean {
  try {
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
      .get();
    db.close();
    return !!row;
  } catch {
    return false;
  }
}

/**
 * 找出本機 D1 資料庫檔案。
 *
 * wrangler 的檔名是依 database_id 推導的雜湊，無法直接計算；
 * 若 database_id 曾變更，狀態目錄中會同時存在多個 .sqlite 檔，
 * 必須依「指標檔」或「含 schema 且最近修改」來挑選，否則會開到空資料庫。
 *
 * 若尚未建立，拋出明確錯誤指引使用者先執行遷移。
 */
export function resolveLocalD1Path(): string {
  // 1. 指標檔（由 scripts/migrate.mjs 寫入，最準確）
  try {
    if (existsSync(POINTER_FILE)) {
      const pointer = JSON.parse(readFileSync(POINTER_FILE, 'utf8'));
      if (pointer?.sqlitePath && existsSync(pointer.sqlitePath)) {
        return pointer.sqlitePath;
      }
    }
  } catch {
    // 忽略，改用掃描
  }

  // 2. 掃描狀態目錄，挑選含 products 表且最近修改的檔案
  if (existsSync(D1_STATE_DIR)) {
    const files = readdirSync(D1_STATE_DIR)
      .filter((f) => f.endsWith('.sqlite'))
      .map((f) => path.join(D1_STATE_DIR, f))
      .filter(hasPosSchema)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    if (files.length > 0) {
      return files[0];
    }
  }

  throw new Error(
    [
      '找不到可用的本機 D1 資料庫。',
      '',
      '請先在專案根目錄執行：',
      '  npm run db:setup      # 建立 schema 並匯入示範資料',
      '',
      '（若剛更換過 wrangler.toml 的 database_id，必須重新執行 db:setup）',
    ].join('\n')
  );
}
