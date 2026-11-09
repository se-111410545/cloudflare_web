import { createMiddleware } from 'hono/factory';
import { Context } from 'hono';
import { AppEnv, JWTPayload } from '../types';

/**
 * 管理者權限的環境隔離
 *
 * 目標：
 *   1. 線上（Cloudflare Worker）版本預設「封鎖高風險寫入」，
 *      避免對外曝露的部署被任意竄改資料。
 *   2. 本機（localhost / 127.0.0.1）維持完整管理能力，方便開發與除錯。
 *   3. 需要時可用 ALLOW_REMOTE_ADMIN=true 明確開放遠端管理寫入。
 *
 * 判斷「是否遠端」的方式：檢視請求主機名稱。
 *   - 本機 wrangler dev / npm run dev → hostname 為 127.0.0.1 或 localhost → 本機
 *   - 線上部署 → hostname 為 *.workers.dev 或自訂網域 → 遠端
 */

/** 本機主機名稱清單 */
const LOCAL_HOSTNAMES = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  '[::1]',
  '0.0.0.0',
]);

/** 判斷請求是否來自本機環境 */
export function isLocalRequest(c: Context<AppEnv>): boolean {
  let hostname = '';
  try {
    hostname = new URL(c.req.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return LOCAL_HOSTNAMES.has(hostname);
}

/** 是否已明確允許遠端管理寫入（ALLOW_REMOTE_ADMIN=true / 1） */
export function remoteAdminEnabled(c: Context<AppEnv>): boolean {
  const flag = c.env.ALLOW_REMOTE_ADMIN;
  return flag === 'true' || flag === '1';
}

/** 請求是否屬於「遠端且未開放管理寫入」 */
export function isRemoteLocked(c: Context<AppEnv>): boolean {
  return !isLocalRequest(c) && !remoteAdminEnabled(c);
}

/**
 * 高風險寫入守門
 *
 * 套用於：刪除資料、修改商品與分類、變更員工與角色權限、刪除檔案。
 * 遠端且未設定 ALLOW_REMOTE_ADMIN=true 時回傳 403。
 */
export const requireAdminWrite = createMiddleware<AppEnv>(async (c, next) => {
  if (!isRemoteLocked(c)) {
    return next();
  }

  return c.json(
    {
      error: 'Forbidden: remote admin writes are disabled',
      hint:
        '此為線上環境，管理寫入預設封鎖以避免資料被任意竄改。' +
        '若確實需要，請設定 ALLOW_REMOTE_ADMIN=true（npx wrangler secret put ALLOW_REMOTE_ADMIN）後重新部署；' +
        '或改由本機（localhost:8787）進行管理。',
    },
    403
  );
});

/**
 * 管理權限範圍判定
 *
 * - 本機環境 → 'full'（完整管理能力）
 * - 遠端 + ALLOW_REMOTE_ADMIN=true → 'full'
 * - 遠端 + 未開放 → 'restricted'（Boss 權限降級為店長，無法變更權限與員工）
 */
export function resolveAdminScope(c: Context<AppEnv>): 'full' | 'restricted' {
  return isRemoteLocked(c) ? 'restricted' : 'full';
}

/** 降級後承接的職稱 */
export const DOWNGRADED_ROLE_NAME = 'Store Manager';

/**
 * 將 Boss 權限降級為店長（遠端鎖定時使用）
 *
 * 注意：必須一併更換 roleId，
 * 否則 checkPermission() 仍會以原本的 Boss 角色查詢權限，
 * 導致降級失效（可變更員工與權限）。
 */
export async function downgradeBossRole(
  c: Context<AppEnv>,
  payload: JWTPayload
): Promise<JWTPayload> {
  const row = await c.env.DB
    .prepare('SELECT id, hierarchy_level FROM roles WHERE role_name = ?')
    .bind(DOWNGRADED_ROLE_NAME)
    .first<{ id: number; hierarchy_level: number }>();

  const targetLevel = row?.hierarchy_level ?? 3;

  return {
    ...payload,
    role: DOWNGRADED_ROLE_NAME,
    roleId: row?.id ?? payload.roleId,
    hierarchyLevel: Math.min(payload.hierarchyLevel ?? targetLevel, targetLevel),
    adminScope: 'restricted',
  };
}
