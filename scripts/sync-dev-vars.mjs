#!/usr/bin/env node
/**
 * 將 .env 同步為 .dev.vars（供 wrangler dev 使用）
 *
 * wrangler dev 只會讀取 .dev.vars，不會讀 .env。
 * 為了讓「.env 是唯一設定來源」，啟動 wrangler 前先同步一次。
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, ROOT } from './env.mjs';

const envPath = path.join(ROOT, '.env');
const devVarsPath = path.join(ROOT, '.dev.vars');

if (!fs.existsSync(envPath)) {
  console.log('ℹ 找不到 .env，略過 .dev.vars 同步。');
  console.log('  （可執行 cp .env.example .env 建立）');
  process.exit(0);
}

const parsed = loadEnv();

// 僅同步 Worker 需要的變數
const KEYS = ['JWT_SECRET', 'ALLOW_REMOTE_ADMIN'];

const lines = ['# 由 .env 自動產生，請勿手動修改', '# 來源：.env（修改 .env 後重新啟動 wrangler dev 即可）'];

for (const key of KEYS) {
  if (parsed[key] !== undefined) {
    lines.push(`${key}="${parsed[key]}"`);
  }
}

fs.writeFileSync(devVarsPath, lines.join('\n') + '\n', 'utf8');
console.log(`✔ 已將 .env 同步至 .dev.vars（${KEYS.filter((k) => parsed[k] !== undefined).join(', ')}）`);
