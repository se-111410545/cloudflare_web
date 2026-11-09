#!/usr/bin/env node
/**
 * 重設管理者 PIN / 密碼
 *
 * 將指定使用者的 PIN 與密碼以 bcrypt 雜湊寫入資料庫。
 * 密碼雜湊後不再可逆，遺忘時只能重新設定（這是預期行為）。
 *
 * 用法：
 *   npm run db:reset-admin                    # 本機，預設重設 Boss
 *   npm run db:reset-admin -- --email a@b.c   # 指定帳號
 *   npm run db:reset-admin -- --remote        # 雲端 D1
 *   npm run db:reset-admin -- --pin 1234      # 直接指定 PIN（略過互動輸入）
 *
 * 未指定 --pin 時會互動式詢問（輸入內容不會顯示於畫面）。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadEnv, sqlEscape, ROOT } from './env.mjs';
import { hashSecret } from '../src/lib/password.ts';
import { pinLookup } from '../src/lib/pin-lookup.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const argv = process.argv.slice(2);
const remote = argv.includes('--remote');
const MODE = remote ? '--remote' : '--local';

const emailIndex = argv.indexOf('--email');
const email = emailIndex !== -1 ? argv[emailIndex + 1] : 'boss@example.com';

const pinIndex = argv.indexOf('--pin');
const pinArg = pinIndex !== -1 ? argv[pinIndex + 1] : undefined;

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

/**
 * 遮蔽輸入的 PIN 提示
 */
function promptMasked(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      if (['\n', '\r', ''].includes(char.toString('utf8'))) {
        process.stdin.removeListener('data', onData);
      } else {
        readline.moveCursor(process.stdout, -1, 0);
        readline.clearLine(process.stdout, 1);
        process.stdout.write(question + '*'.repeat(char.toString('utf8').length));
      }
    };
    process.stdout.write(question);
    process.stdin.on('data', onData);
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------
// 決定 PIN
// ---------------------------------------------------------------
loadEnv();
const env = { ...process.env };

let pin = pinArg;

if (!pin) {
  if (env.ADMIN_PIN && email === 'boss@example.com' && !process.stdin.isTTY) {
    // 非互動模式：改用 .env 的 ADMIN_PIN
    pin = env.ADMIN_PIN;
    console.log(`  使用 .env 的 ADMIN_PIN（${pin}）`);
  } else {
    console.log('\n  請輸入新的管理 PIN（4-6 位數）');
    pin = await promptMasked('  PIN: ');
  }
}

if (!/^\d{4,6}$/.test(pin || '')) {
  console.error('✖ PIN 必須是 4-6 位數字');
  process.exit(1);
}

const password = pin;

// ---------------------------------------------------------------
// 雜湊並寫入
// ---------------------------------------------------------------
const pinHash = await hashSecret(pin);
const passwordHash = await hashSecret(password);
const lookup = await pinLookup(pin);

const sql = `
UPDATE users
SET pin_code = '${sqlEscape(pinHash)}',
    password_hash = '${sqlEscape(passwordHash)}',
    pin_lookup = '${sqlEscape(lookup)}'
WHERE email = '${sqlEscape(email)}';

SELECT id, name, email FROM users WHERE email = '${sqlEscape(email)}';
`;

const tmpFile = path.join(os.tmpdir(), `pos-reset-admin-${Date.now()}.sql`);
fs.writeFileSync(tmpFile, sql, 'utf8');

console.log(`\n▶ 重設管理者憑證  |  ${email}  |  ${remote ? '遠端 D1' : '本機 D1'}\n`);

try {
  const output = wrangler(['d1', 'execute', 'pos-db', MODE, '--file', tmpFile]);
  const found = /"email"\s*:\s*"([^"]+)"/.exec(output);
  if (!found) {
    console.error(`✖ 找不到帳號：${email}`);
    console.error('  可先執行 npm run db:seed 建立帳號。');
    process.exit(1);
  }
} finally {
  fs.rmSync(tmpFile, { force: true });
}

console.log(`  ✔ 已更新 ${email} 的 PIN 與密碼（bcrypt 雜湊）`);
console.log(`  新 PIN: ${pin}`);
console.log('');
console.log('  提醒：此 PIN 現在可用於登入，請勿公開分享。');
console.log('');
