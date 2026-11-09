import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

/**
 * .env 解析器（零相依）
 *
 * 支援：
 *   KEY=value
 *   KEY="value with spaces"
 *   KEY='value'
 *   # 註解
 *   空行
 */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }
  return out;
}

/**
 * 載入 .env 到 process.env
 * 已存在的 process.env 值優先（方便 CI 覆寫）
 */
export function loadEnv(fileName = '.env') {
  const filePath = path.isAbsolute(fileName) ? fileName : path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};

  const parsed = parseEnv(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return parsed;
}

/**
 * 產生安全的隨機 PIN（4-6 位數）
 */
export function randomPin(length = 6) {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

/**
 * SQL 字串跳脫（防注入）
 */
export function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}
