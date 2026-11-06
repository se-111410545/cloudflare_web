#!/usr/bin/env node
/**
 * D1 資料庫遷移執行器
 *
 * 解決的問題：
 *   - 終端機不在專案根目錄時 wrangler 找不到 migrations/ 與 wrangler.toml
 *     → 本腳本以 __dirname 推導專案根目錄，無論從哪個目錄執行都能正確運作
 *   - 重複執行遷移造成 "duplicate column" 等錯誤
 *     → 以 schema_migrations 資料表記錄已套用的檔案，只執行尚未套用者
 *
 * 用法：
 *   node scripts/migrate.mjs --local     本機資料庫（預設）
 *   node scripts/migrate.mjs --remote    雲端資料庫
 *   node scripts/migrate.mjs --local --db other-db
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listLocalSqliteFiles,
  hasPosSchema,
  writeLocalDbPointer,
} from './local-db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const argv = process.argv.slice(2);
const remote = argv.includes('--remote');
const MODE = remote ? '--remote' : '--local';
const dbArgIndex = argv.indexOf('--db');
const dbOverride = dbArgIndex !== -1 ? argv[dbArgIndex + 1] : undefined;

// ---------------------------------------------------------------
// 工具
// ---------------------------------------------------------------
function wrangler(args) {
  try {
    return execFileSync(process.execPath, [WRANGLER_BIN, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = err.stderr?.toString() ?? '';
    const stdout = err.stdout?.toString() ?? '';
    console.error(stderr || stdout || err.message);
    process.exit(1);
  }
}

/** 從 wrangler.toml 取得第一個 D1 資料庫名稱 */
function resolveDatabaseName() {
  if (dbOverride) return dbOverride;

  const tomlPath = path.join(ROOT, 'wrangler.toml');
  if (!fs.existsSync(tomlPath)) {
    console.error(`✖ 找不到 ${tomlPath}`);
    console.error('  請確認專案根目錄結構是否完整。');
    process.exit(1);
  }

  const toml = fs.readFileSync(tomlPath, 'utf8');
  const block = toml.match(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[|$)/);
  const name = block?.[1]?.match(/database_name\s*=\s*"([^"]+)"/)?.[1];

  if (!name) {
    console.error('✖ wrangler.toml 中找不到 [[d1_databases]] 的 database_name');
    process.exit(1);
  }
  return name;
}

/** 從 wrangler.toml 取得 database_id */
function readDatabaseId() {
  const toml = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const block = toml.match(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[|$)/);
  return block?.[1]?.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ?? 'unknown';
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------
const dbName = resolveDatabaseName();
const targetLabel = remote ? '遠端 (Cloudflare D1)' : '本機 (--local)';

console.log(`\n▶ 資料庫遷移  |  ${dbName}  |  ${targetLabel}\n`);

// 1. 確保追蹤表格存在
wrangler([
  'd1',
  'execute',
  dbName,
  MODE,
  '--command',
  'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)',
]);

// 2. 查詢已套用的遷移
const appliedOutput = wrangler([
  'd1',
  'execute',
  dbName,
  MODE,
  '--command',
  'SELECT name AS mig_name FROM schema_migrations',
]);
const applied = new Set(
  [...appliedOutput.matchAll(/"mig_name"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
);

// 3. 依序套用未執行的遷移
const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// 遷移前先記錄各 SQLite 檔的修改時間，
// 遷移後即可判定哪個檔案是「本次 database_id 實際對應的那一個」
const mtimeBefore = new Map(
  listLocalSqliteFiles().map((f) => [f, fs.statSync(f).mtimeMs])
);

if (files.length === 0) {
  console.error(`✖ ${MIGRATIONS_DIR} 內沒有 .sql 檔案`);
  process.exit(1);
}

let count = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`  ○ ${file}  (已套用，略過)`);
    continue;
  }

  console.log(`  → ${file}  套用中...`);
  wrangler(['d1', 'execute', dbName, MODE, '--file', path.join(MIGRATIONS_DIR, file)]);
  wrangler([
    'd1',
    'execute',
    dbName,
    MODE,
    '--command',
    `INSERT INTO schema_migrations (name) VALUES ('${file.replace(/'/g, "''")}')`,
  ]);
  console.log(`  ✓ ${file}  完成`);
  count++;
}

console.log(
  count === 0
    ? '\n✔ 資料庫已是最新，無需遷移。\n'
    : `\n✔ 遷移完成，共套用 ${count} 個檔案。\n`
);

// ---------------------------------------------------------------
// 4. 記錄本機 D1 對應的 SQLite 檔案
//
// wrangler --local 的檔名是依 database_id 推導的雜湊，
// 若 database_id 變更過，目錄中會有多個 .sqlite 檔。
// 寫入指標檔讓 server/local.ts 能確定開啟正確的資料庫。
// ---------------------------------------------------------------
if (!remote) {
  const dbId = readDatabaseId();
  const all = listLocalSqliteFiles();

  // 優先取「本次被寫入」的檔案（mtime 有變動），
  // 其次取含 schema 且最近修改者
  const touched = all
    .filter((f) => {
      const before = mtimeBefore.get(f);
      return before === undefined || fs.statSync(f).mtimeMs !== before;
    })
    .filter(hasPosSchema);

  const candidates =
    touched.length > 0
      ? touched.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
      : all
          .filter(hasPosSchema)
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (candidates.length > 0) {
    writeLocalDbPointer(dbId, candidates[0]);
    console.log(`  ℹ 本機 D1 指標已更新：`);
    console.log(`     ${candidates[0]}`);
    console.log('');
  }
}
