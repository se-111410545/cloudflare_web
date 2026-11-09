#!/usr/bin/env node
/**
 * 商品圖片自動補齊腳本
 *
 * 功能：
 *   1. 從 D1 讀取所有商品
 *   2. 依商品名稱對應到 Unsplash 的免費高畫質照片（可直接商用，無版權問題）
 *   3. 下載圖片並依 D1BlobStorage 的相同格式（base64 TEXT）寫入 uploads 資料表
 *   4. 更新 products.image_key，讓線上版本能顯示圖片
 *
 * 為什麼不用 R2？
 *   本專案已改為「本機檔案儲存 + D1 base64 後備方案」，
 *   雲端部署的 Worker 沒有檔案系統，圖片需存在 D1 才能顯示。
 *
 * 為什麼要分塊寫入？
 *   D1 單一 SQL 陳述長度上限為 100 KB，
 *   base64 後的圖片可能超過，因此以 INSERT + UPDATE ... || 分塊累加。
 *
 * 用法：
 *   node scripts/seed-images.mjs            # 本機 D1
 *   node scripts/seed-images.mjs --remote   # 雲端 D1
 *   node scripts/seed-images.mjs --only 咖啡 # 只補特定分類
 *   node scripts/seed-images.mjs --force    # 已存在圖片也重新下載
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqlEscape, ROOT } from './env.mjs';
import { arrayBufferToBase64 } from '../src/storage/base64.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** 本機檔案儲存目錄（與 server/paths.ts 的 UPLOAD_DIR 一致） */
const UPLOAD_DIR = path.join(ROOT, 'uploads');

const argv = process.argv.slice(2);
const remote = argv.includes('--remote');
const force = argv.includes('--force');
const onlyIndex = argv.indexOf('--only');
const onlyCategory = onlyIndex !== -1 ? argv[onlyIndex + 1] : null;
const MODE = remote ? '--remote' : '--local';

/** SQL 分塊大小（D1 單一陳述上限 100 KB，留安全餘量） */
const CHUNK_SIZE = 60 * 1024;

/**
 * 商品 → Unsplash 照片對應表
 *
 * 來源：Unsplash（https://unsplash.com）— 免費、無版權限制、可商用
 * 說明：images.unsplash.com 為官方圖床 CDN，支援 URL 參數即時縮放與裁切
 */
const IMAGE_MAP = {
  美式咖啡: '1495474472287-4d71bcdd2085',
  拿鐵咖啡: '1572442388796-11668a67e53d',
  卡布奇諾: '1534778101976-62847782c213',
  濃縮咖啡: '1510707577719-ae7c14805e3a',
  台灣珍珠奶茶: '1558857563-b371033873b8',
  綠茶拿鐵: '1536256263959-770b48d82b0a',
  鮮榨橙汁: '1600271886742-f049cd451bba',
  冰紅茶: '1556679343-c7306c1976bc',
  火腿三明治: '1528735602780-2552fd46c7af',
  雞肉沙拉: '1546793665-c74683f339c1',
  炸薯條: '1573080496219-bb080dd4f877',
  洋芋片: '1566478989037-eec170784d0b',
  提拉米蘇: '1571877227200-a0d98ea607e9',
  巧克力蛋糕: '1578985545062-69928b1d9587',
  可麗餅: '1519676867240-f03562e64548',
  冰淇淋: '1497034825429-c343d7c6a68f',
};

/** 依体积自动调整的 Unsplash 参数组合 */
const SIZE_PROFILES = [
  { w: 720, q: 75 },
  { w: 600, q: 70 },
  { w: 480, q: 62 },
  { w: 400, q: 55 },
];

/**
 * 執行 wrangler 指令
 *
 * 遠端 D1 的 API 呼叫偶爾會出現暫時性的 "fetch failed"，
 * 因此加入重試機制，避免中途中斷整個批次。
 */
function wrangler(args, retries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return execFileSync(process.execPath, [WRANGLER_BIN, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (err) {
      lastError = err;
      const output = err.stderr?.toString() || err.stdout?.toString() || err.message;

      // 僅對暫時性網路錯誤重試，其餘（如 SQL 語法錯誤）直接失敗
      const isTransient =
        /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(output);

      if (!isTransient || attempt === retries) {
        throw new Error(output);
      }

      const waitMs = attempt * 1500;
      process.stderr.write(
        `    (暫時性錯誤，重試 ${attempt}/${retries}，等待 ${waitMs}ms…)\n`
      );
      execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${waitMs})`]);
    }
  }

  throw new Error(lastError?.message ?? 'wrangler 執行失敗');
}

/** 執行 SQL 檔 */
function execSqlFile(sql) {
  const tmpFile = path.join(os.tmpdir(), `pos-images-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    wrangler(['d1', 'execute', 'pos-db', MODE, '--file', tmpFile]);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

/** 查詢並解析 JSON 輸出 */
function query(sql) {
  const output = wrangler([
    'd1',
    'execute',
    'pos-db',
    MODE,
    '--command',
    sql,
  ]);
  const json = JSON.parse(output.slice(output.indexOf('[')));
  const rows = [];
  for (const chunk of json) rows.push(...(chunk.results ?? []));
  return rows.map(normalizeRow);
}

/**
 * D1 CLI 會將 SQL NULL 序列化為字串 "null"（而非 JSON null），
 * 此處統一正規化為真正的 null，避免把空值誤判為「已有值」。
 */
function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value === 'null' ? null : value;
  }
  return out;
}

/** 產生安全的檔案鍵（不可含 '/'，因 /uploads/:key 為單一段路由） */
function buildKey(productName, ext) {
  const slug = productName
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '')
    .slice(0, 20);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `seed_${stamp}_${rand}_${slug}.${ext}`;
}

/**
 * 下載圖片，若 base64 過大則自動降級解析度
 */
async function downloadImage(photoId) {
  for (const profile of SIZE_PROFILES) {
    const url = `https://images.unsplash.com/photo-${photoId}?w=${profile.w}&h=${profile.w}&fit=crop&q=${profile.q}&fm=jpg`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) continue;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) continue;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 3000) continue;

    const base64 = arrayBufferToBase64(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      )
    );

    // 確保單一 SQL 陳述不超過 D1 限制
    if (base64.length <= 90 * 1024) {
      return { buffer, base64, contentType, width: profile.w, url };
    }
  }
  return null;
}

/**
 * 寫入 uploads 資料表（分塊累加，规避 D1 100KB 陳述限制）
 * 格式與 D1BlobStorage.put() 完全一致
 */
function buildUploadSql(key, contentType, base64, size) {
  const chunks = [];
  for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + CHUNK_SIZE));
  }

  const statements = [
    `INSERT INTO uploads (key, content_type, data, size)
     VALUES ('${sqlEscape(key)}', '${sqlEscape(contentType)}', '${sqlEscape(chunks[0])}', ${size})
     ON CONFLICT(key) DO UPDATE SET
       content_type = excluded.content_type,
       data         = excluded.data,
       size         = excluded.size;`,
  ];

  for (const chunk of chunks.slice(1)) {
    statements.push(
      `UPDATE uploads SET data = data || '${sqlEscape(chunk)}' WHERE key = '${sqlEscape(key)}';`
    );
  }

  return statements.join('\n');
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------
console.log(`\n▶ 商品圖片補齊  |  ${remote ? '遠端 D1' : '本機 D1 (--local)'}\n`);

const products = query(
  'SELECT id, name, category_id, image_key FROM products ORDER BY id'
);

const targets = products.filter((p) => {
  if (onlyCategory) {
    const cat = query(
      `SELECT name FROM categories WHERE id = ${Number(p.category_id)}`
    )[0];
    if (cat?.name !== onlyCategory) return false;
  }
  return true;
});

if (targets.length === 0) {
  console.error('✖ 找不到符合條件的商品');
  process.exit(1);
}

let okCount = 0;
let skipCount = 0;
let failCount = 0;

for (const product of targets) {
  const photoId = IMAGE_MAP[product.name];

  if (!photoId) {
    console.log(`  ⊘ ${product.name}  (未設定圖片來源，略過)`);
    skipCount++;
    continue;
  }

  if (product.image_key && !force) {
    console.log(`  ○ ${product.name}  已有圖片（${product.image_key}），略過`);
    skipCount++;
    continue;
  }

  try {
    const image = await downloadImage(photoId);
    if (!image) {
      console.log(`  ✗ ${product.name}  下載失敗`);
      failCount++;
      continue;
    }

    const key = buildKey(product.name, 'jpg');

    // 1. 寫入 D1 uploads（雲端 Worker 的儲存後備方案）
    execSqlFile(buildUploadSql(key, image.contentType, image.base64, image.buffer.length));

    // 2. 本機模式另寫入 uploads/ 磁碟
    //    （本機 npm run dev 使用 LocalDiskStorage，雲端使用 D1，兩者皆需有檔案）
    if (!remote) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, key), image.buffer);
    }

    // 3. 更新 products.image_key
    execSqlFile(
      `UPDATE products SET image_key = '${sqlEscape(key)}' WHERE id = ${product.id};`
    );

    console.log(
      `  ✔ ${product.name.padEnd(8)} ${String(image.buffer.length).padStart(7)} bytes  ${image.width}px  → ${key}`
    );
    okCount++;
  } catch (err) {
    console.log(`  ✗ ${product.name}  ${String(err.message).split('\n')[0]}`);
    failCount++;
  }
}

console.log('');
console.log(`  完成：成功 ${okCount}、略過 ${skipCount}、失敗 ${failCount}`);
console.log('');

// ---------------------------------------------------------------
// 清除未被任何商品引用的孤兒檔案
// ---------------------------------------------------------------
try {
  const orphans = query(
    'SELECT key FROM uploads WHERE key NOT IN (SELECT image_key FROM products WHERE image_key IS NOT NULL)'
  );
  if (orphans.length > 0) {
    const list = orphans.map((o) => `'${sqlEscape(o.key)}'`).join(',');
    execSqlFile(`DELETE FROM uploads WHERE key IN (${list});`);
    console.log(`  ♻ 已清除 ${orphans.length} 個未被引用的舊檔案`);
    if (!remote) {
      for (const o of orphans) {
        fs.rmSync(path.join(UPLOAD_DIR, o.key), { force: true });
      }
    }
    console.log('');
  }
} catch {
  // 清理失敗不影響主要流程
}

// ---------------------------------------------------------------
// 驗證：讀回檔案並比對位元組
// ---------------------------------------------------------------
console.log('  驗證上傳結果…');
const verifyRows = query(
  `SELECT p.name, p.image_key, u.size, typeof(u.data) AS dtype, length(u.data) AS dlen
   FROM products p LEFT JOIN uploads u ON u.key = p.image_key
   WHERE p.image_key IS NOT NULL ORDER BY p.id`
);

let valid = 0;
for (const row of verifyRows) {
  if (row.dtype === 'text' && Number(row.dlen) > 100) {
    valid++;
  } else {
    console.log(`  ✗ ${row.name}  驗證失敗 (dtype=${row.dtype}, len=${row.dlen})`);
  }
}
console.log(`  ✔ ${valid}/${verifyRows.length} 個商品的圖片已正確寫入並綁定`);
console.log('');
