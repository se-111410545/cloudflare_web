import { createMiddleware } from 'hono/factory';
import { jwt } from 'hono/jwt';
import { AppEnv, JWTPayload } from '../types';
import { isRemoteLocked, resolveAdminScope, downgradeBossRole } from './admin-guard';

/**
 * JWT 認證中介軟體
 *
 * 驗證 Bearer Token 並將解碼後的 payload 存入 c.set('user', ...)
 *
 * 同時套用「管理者權限環境隔離」：
 *   遠端環境且未設定 ALLOW_REMOTE_ADMIN 時，
 *   Boss 的權限會降級為 Store Manager（hierarchy 3），
 *   因此無法在線上變更員工、角色權限等高風險資料。
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const mw = jwt({
    secret: c.env.JWT_SECRET,
    alg: 'HS256',
  });
  // hono/jwt 會將驗證後的 payload 放入 c.get('jwtPayload')
  await mw(c, async () => {
    let payload = c.get('jwtPayload') as JWTPayload;

    // 遠端鎖定：最高管理者權限降級（role 與 roleId 一併更換）
    if (isRemoteLocked(c) && payload.role === 'Boss') {
      payload = await downgradeBossRole(c, payload);
    } else {
      payload = { ...payload, adminScope: resolveAdminScope(c) };
    }

    c.set('user', payload);
    await next();
  });
});

/**
 * 限定特定角色才能進入
 * 例如 requireRole(['Boss', 'Store Manager'])
 */
export const requireRole = (allowedRoles: string[]) => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json({ error: 'Forbidden: insufficient role' }, 403);
    }
    await next();
  });
};

/**
 * 限定最小階級 (hierarchy_level)
 * Boss=4, Store Manager=3, Supervisor=2, Staff=1
 */
export const requireMinHierarchy = (minLevel: number) => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user || (user.hierarchyLevel ?? 0) < minLevel) {
      return c.json({ error: 'Forbidden: insufficient hierarchy level' }, 403);
    }
    await next();
  });
};

/**
 * 檢查該角色是否擁有特定功能權限 (動態按鈕權限)
 * 例如 checkPermission('discount:30')
 */
export const checkPermission = (permissionKey: string) => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    const row = await c.env.DB
      .prepare(
        `SELECT rp.permission_id 
         FROM role_permissions rp 
         JOIN permissions p ON p.id = rp.permission_id 
         WHERE rp.role_id = ? AND p.permission_key = ?`
      )
      .bind(user.roleId, permissionKey)
      .first();

    if (!row) {
      return c.json({ error: `Forbidden: missing permission ${permissionKey}` }, 403);
    }
    await next();
  });
};
