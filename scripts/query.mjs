#!/usr/bin/env node
/**
 * 本機 D1 查詢工具
 *
 * 用法：
 *   npm run db:query -- "SELECT * FROM products LIMIT 5"
 *   npm run db:query -- "SELECT name FROM sqlite_master WHERE type='table'"
 *
 * 優點：SQL 作為單一引數傳遞，不會被 shell 拆解，
 *       也解決 D1 `--command` 不支援多敘述的問題（請用分號分次執行）。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const sql = process.argv.slice(2).join(' ').trim();

if (!sql) {
  console.error('請提供 SQL 查詢，例如：');
  console.error('  npm run db:query -- "SELECT * FROM products LIMIT 5"');
  process.exit(1);
}

const remote = process.argv.includes('--remote');
const mode = remote ? '--remote' : '--local';

try {
  const out = execFileSync(
    process.execPath,
    [WRANGLER_BIN, 'd1', 'execute', 'pos-db', mode, '--command', sql],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  console.log(out);
} catch (err) {
  console.error(err.stderr?.toString() || err.stdout?.toString() || err.message);
  process.exit(1);
}
