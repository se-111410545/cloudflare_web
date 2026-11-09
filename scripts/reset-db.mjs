#!/usr/bin/env node
/**
 * 重設本機 D1 資料庫
 *
 * 刪除 wrangler --local 的 D1 狀態檔，再重新執行遷移與種子資料。
 * 用途：修改了 migrations/*.sql 或種子資料後，需要乾淨重建資料庫。
 *
 * 用法：node scripts/reset-db.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const D1_STATE_DIR = path.join(ROOT, '.wrangler', 'state', 'v3', 'd1');
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function run(args) {
  execFileSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    maxBuffer: 32 * 1024 * 1024,
  });
}

console.log('\n▶ 重設本機 D1 資料庫\n');

if (fs.existsSync(D1_STATE_DIR)) {
  fs.rmSync(D1_STATE_DIR, { recursive: true, force: true });
  console.log('  ✓ 已清除本機 D1 狀態');
} else {
  console.log('  ○ 本機 D1 尚未建立，略過清除');
}

// 1. 套用 schema 遷移
run([path.join(ROOT, 'scripts', 'migrate.mjs'), '--local']);

// 2. 匯入種子（含 bcrypt 雜湊的使用者憑證）
run([path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'scripts', 'seed.mjs')]);

console.log('\n✔ 本機資料庫已重設完成。\n');
