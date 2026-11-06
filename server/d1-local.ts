import { DatabaseSync } from 'node:sqlite';

/**
 * D1Database 相容層
 *
 * 以 Node 內建的 `node:sqlite`（Node 22.5+ / Node 24 穩定）包裝出 D1 的 API 介面，
 * 讓 src/routes/** 完全不必修改即可在 Node 本機環境執行。
 *
 * 直接開啟 wrangler --local 建立的 SQLite 檔案，
 * 因此 `npm run db:migrate` 匯入的資料與本機伺服器讀寫的是同一份資料庫。
 */

type Row = Record<string, unknown>;

/** 將 JS 值轉為 SQLite 可綁定的值 */
function normalizeParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return value;
}

/** 將 SQLite 回傳列正規化（BLOB 轉 ArrayBuffer） */
function normalizeRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Uint8Array) {
      out[key] = value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength
      ) as ArrayBuffer;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface LocalD1Statement {
  bind(...values: unknown[]): LocalD1Statement;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }>;
  run(): Promise<{
    success: boolean;
    meta: { last_row_id: number; changes: number; duration: number };
  }>;
}

export interface LocalD1Database {
  prepare(sql: string): LocalD1Statement;
  exec(sql: string): Promise<void>;
  batch<T = Row>(statements: LocalD1Statement[]): Promise<{ results: T[] }>;
}

export function createLocalD1(dbPath: string): LocalD1Database {
  const db = new DatabaseSync(dbPath);

  // WAL 模式：讓 wrangler 遷移與伺服器讀寫可以安全並行
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  const prepare = (sql: string): LocalD1Statement => {
    const stmt = db.prepare(sql);
    let params: unknown[] = [];

    const bound: LocalD1Statement = {
      bind(...values: unknown[]) {
        params = values.map(normalizeParam);
        return bound;
      },

      async first<T = Row>(): Promise<T | null> {
        const row = stmt.get(...(params as never[])) as Row | undefined;
        return row ? (normalizeRow(row) as T) : null;
      },

      async all<T = Row>() {
        const rows = stmt.all(...(params as never[])) as Row[];
        return {
          results: rows.map((r) => normalizeRow(r)) as T[],
          success: true,
          meta: { duration: 0 },
        };
      },

      async run() {
        const result = stmt.run(...(params as never[]));
        return {
          success: true,
          meta: {
            last_row_id: Number(result.lastInsertRowid),
            changes: Number(result.changes),
            duration: 0,
          },
        };
      },
    };

    return bound;
  };

  return {
    prepare,

    async exec(sql: string) {
      db.exec(sql);
    },

    async batch<T = Row>(statements: LocalD1Statement[]) {
      const results: T[] = [];
      for (const s of statements) {
        const r = await s.all<T>();
        results.push(...r.results);
      }
      return { results };
    },
  };
}
