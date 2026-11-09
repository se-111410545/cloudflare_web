#!/usr/bin/env node
/**
 * 種子資料（含使用者憑證）
 *
 * 與一般 SQL 種子不同，使用者的密碼 / PIN 必須經過 bcrypt 雜湊，
 * 因此這支腳本會：
 *   1. 讀取 .env 的 ADMIN_PIN / ADMIN_PASSWORD（與各角色的 *_PIN）
 *   2. 以 bcrypt 產生雜湊，並計算 PIN 的 lookup 雜湊（sha256，供索引查找）
 *   3. 組出完整 SQL 後交給 wrangler 執行（支援 --local / --remote）
 *
 * PIN 設定規則：
 *   - .env 有設定該角色的 PIN → 套用（可隨時更新）
 *   - .env 未設定但該帳號已有 PIN → 保留原值（避免重跑種子使舊 PIN 失效）
 *   - 以上皆無 → 產生隨機 PIN 並顯示
 *
 * 用法：
 *   npm run db:seed          # 本機
 *   npm run db:seed:remote   # 雲端
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, randomPin, sqlEscape, ROOT } from './env.mjs';
import { hashSecret } from '../src/lib/password.ts';
import { pinLookup } from '../src/lib/pin-lookup.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const remote = process.argv.includes('--remote');
const MODE = remote ? '--remote' : '--local';

const USERS = [
  {
    name: '老闆',
    email: 'boss@example.com',
    roleId: 1,
    pinEnv: 'ADMIN_PIN',
    passwordEnv: 'ADMIN_PASSWORD',
  },
  {
    name: '店長',
    email: 'manager@example.com',
    roleId: 2,
    pinEnv: 'MANAGER_PIN',
    passwordEnv: 'MANAGER_PASSWORD',
  },
  {
    name: '小主管',
    email: 'supervisor@example.com',
    roleId: 3,
    pinEnv: 'SUPERVISOR_PIN',
    passwordEnv: 'SUPERVISOR_PASSWORD',
  },
  {
    name: '員工',
    email: 'staff@example.com',
    roleId: 4,
    pinEnv: 'STAFF_PIN',
    passwordEnv: 'STAFF_PASSWORD',
  },
];

function wrangler(args) {
  try {
    return execFileSync(process.execPath, [WRANGLER_BIN, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    console.error(err.stderr?.toString() || err.stdout?.toString() || err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------
// 1. 讀取環境變數
// ---------------------------------------------------------------
const fileEnv = loadEnv();
const env = { ...fileEnv, ...process.env };

console.log(`\n▶ 種子資料  |  ${remote ? '遠端 D1' : '本機 D1 (--local)'}\n`);

const adminPin = env.ADMIN_PIN;
if (!adminPin) {
  console.error('✖ .env 中缺少 ADMIN_PIN');
  console.error('');
  console.error('  請先建立 .env 並設定你自己的管理者 PIN：');
  console.error('    cp .env.example .env');
  console.error('    # 然後編輯 .env 中的 ADMIN_PIN');
  console.error('');
  process.exit(1);
}

if (!/^\d{4,6}$/.test(adminPin)) {
  console.error('✖ ADMIN_PIN 必須是 4-6 位數字');
  process.exit(1);
}

// ---------------------------------------------------------------
// 2. 查詢既有使用者的 PIN 狀態
// ---------------------------------------------------------------
const existingPins = new Map();
try {
  const output = wrangler([
    'd1',
    'execute',
    'pos-db',
    MODE,
    '--command',
    'SELECT email, CASE WHEN pin_code IS NOT NULL THEN 1 ELSE 0 END AS has_pin FROM users',
  ]);
  const json = JSON.parse(output.slice(output.indexOf('[')));
  for (const chunk of json) {
    for (const row of chunk.results ?? []) {
      existingPins.set(row.email, Number(row.has_pin) === 1);
    }
  }
} catch {
  // 查詢失敗時視為沒有既有使用者
}

// ---------------------------------------------------------------
// 3. 決定各使用者的憑證
// ---------------------------------------------------------------
const generated = [];
const plans = [];

for (const user of USERS) {
  const envPin = env[user.pinEnv];
  const envPassword = env[user.passwordEnv];
  const alreadyHasPin = existingPins.get(user.email) === true;

  // 未在 .env 設定 PIN 且帳號既有 PIN → 保留原值
  const keepExisting = !envPin && alreadyHasPin;

  let pin = envPin;
  if (!pin) {
    if (keepExisting) {
      pin = null;
    } else {
      pin = randomPin(6);
      generated.push({ role: user.name, email: user.email, pin });
    }
  }

  // 密碼：.env 優先；否則與 PIN 相同；既有帳號且未設定時保留原值
  let password = envPassword;
  let keepExistingPassword = false;
  if (!password) {
    if (keepExisting) {
      keepExistingPassword = true;
      password = null;
    } else {
      password = pin;
    }
  }

  plans.push({
    ...user,
    pin,
    password,
    keepExisting,
    keepExistingPassword,
    pinHash: keepExisting ? null : await hashSecret(pin),
    passwordHash: keepExistingPassword ? null : await hashSecret(password),
    lookup: keepExisting ? null : await pinLookup(pin),
  });
}

// ---------------------------------------------------------------
// 4. 組出 SQL
// ---------------------------------------------------------------
const baseSqlPath = path.join(ROOT, 'seeds', '001_demo_data.sql');
const baseSql = fs.existsSync(baseSqlPath)
  ? fs.readFileSync(baseSqlPath, 'utf8')
  : '';

const userSql = plans
  .map((u) => {
    if (u.keepExisting) {
      // 保留既有憑證，只更新基本資料
      return `
UPDATE users SET name = '${sqlEscape(u.name)}', role_id = ${u.roleId}
WHERE email = '${sqlEscape(u.email)}';`;
    }

    return `
INSERT INTO users (name, email, password_hash, pin_code, pin_lookup, role_id)
VALUES ('${sqlEscape(u.name)}', '${sqlEscape(u.email)}',
        '${sqlEscape(u.passwordHash)}', '${sqlEscape(u.pinHash)}',
        '${sqlEscape(u.lookup)}', ${u.roleId})
ON CONFLICT(email) DO UPDATE SET
  name          = excluded.name,
  password_hash = excluded.password_hash,
  pin_code      = excluded.pin_code,
  pin_lookup    = excluded.pin_lookup,
  role_id       = excluded.role_id;`;
  })
  .join('\n');

const fullSql = `${baseSql}\n${userSql}\n`;

const tmpFile = path.join(os.tmpdir(), `pos-seed-${Date.now()}.sql`);
fs.writeFileSync(tmpFile, fullSql, 'utf8');

try {
  wrangler(['d1', 'execute', 'pos-db', MODE, '--file', tmpFile]);
} finally {
  fs.rmSync(tmpFile, { force: true });
}

// ---------------------------------------------------------------
// 5. 顯示結果
// ---------------------------------------------------------------
console.log('  ✔ 種子資料已套用（密碼與 PIN 均以 bcrypt 雜湊儲存）');
console.log('');
console.log('  帳號                 角色         PIN');
console.log('  ───────────────────  ───────────  ─────────────');
for (const u of plans) {
  let display;
  if (u.keepExisting) {
    display = '(保留原值)';
  } else if (generated.some((g) => g.email === u.email)) {
    display = `${u.pin}  ← 隨機產生`;
  } else {
    display = `${u.pin}  ← 來自 .env`;
  }
  console.log(`  ${u.email.padEnd(20)}  ${u.name.padEnd(11)}  ${display}`);
}
console.log('');
console.log('  密碼（帳密登入）與 PIN 相同，皆以 bcrypt 雜湊儲存。');
console.log('  若要更換 Boss 的 PIN：npm run db:reset-admin');
console.log('');
