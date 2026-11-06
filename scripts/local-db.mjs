import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * 本機 D1 指標檔
 *
 * wrangler --local 會把 SQLite 檔放在
 *   .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
 * 其中 <hash> 由 database_id 推導，無法直接計算。
 * 若 database_id 曾變更，目錄中會同時存在多個 .sqlite 檔，
 * 必須明確記住「目前對應的是哪一個」，否則會開錯資料庫（讀到空表而 500）。
 *
 * 因此由 scripts/migrate.mjs 在遷移後寫入此指標檔，
 * server/paths.ts 再依此指標開啟正確的檔案。
 */
export const POINTER_FILE = path.join(ROOT, '.wrangler', 'local-db.json');

export const D1_STATE_DIR = path.join(
  ROOT,
  '.wrangler',
  'state',
  'v3',
  'd1',
  'miniflare-D1DatabaseObject'
);

/**
 * 掃描本機 D1 狀態目錄，找出所有 .sqlite 檔
 */
export function listLocalSqliteFiles() {
  if (!fs.existsSync(D1_STATE_DIR)) return [];
  return fs
    .readdirSync(D1_STATE_DIR)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => path.join(D1_STATE_DIR, f));
}

/**
 * 判斷某個 SQLite 檔是否含有本專案的 schema
 */
export function hasPosSchema(sqlitePath) {
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
 * 找出目前 database_id 對應的本機 SQLite 檔。
 *
 * 判斷依據（由可靠到模糊）：
 *   1. 指標檔記錄的路徑
 *   2. 含 products 表且最近修改的檔案
 */
export function resolveLocalSqliteFile() {
  const pointer = readLocalDbPointer();
  if (pointer?.sqlitePath && fs.existsSync(pointer.sqlitePath)) {
    return pointer.sqlitePath;
  }

  const files = listLocalSqliteFiles();
  const withSchema = files
    .filter(hasPosSchema)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return withSchema[0] ?? null;
}

/**
 * 寫入指標檔
 */
export function writeLocalDbPointer(databaseId, sqlitePath) {
  fs.mkdirSync(path.dirname(POINTER_FILE), { recursive: true });
  fs.writeFileSync(
    POINTER_FILE,
    JSON.stringify(
      { databaseId, sqlitePath, updatedAt: new Date().toISOString() },
      null,
      2
    ),
    'utf8'
  );
}

/**
 * 讀取指標檔
 */
export function readLocalDbPointer() {
  try {
    if (!fs.existsSync(POINTER_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(POINTER_FILE, 'utf8'));
    return raw?.sqlitePath ? raw : null;
  } catch {
    return null;
  }
}
