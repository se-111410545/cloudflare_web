import { Hono } from 'hono';
import { AppEnv } from '../types';
import { authMiddleware, requireRole, checkPermission } from '../middleware/auth';
import { requireAdminWrite } from '../middleware/admin-guard';
import { hashSecret } from '../lib/password';
import { pinLookup } from '../lib/pin-lookup';

const app = new Hono<AppEnv>();

// -------------------------------------------------------
// 使用者管理
// 高風險寫入（新增/修改/刪除員工）受 requireAdminWrite 保護：
// 線上部署預設封鎖，僅本機或 ALLOW_REMOTE_ADMIN=true 時允許。
app.get('/users', authMiddleware, checkPermission('staff:manage'), async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT u.id, u.name, u.email, u.role_id, u.created_at,
              CASE WHEN u.pin_code IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
              r.role_name, r.hierarchy_level
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    )
    .all();
  return c.json({ users: results });
});

app.get('/users/:id', authMiddleware, checkPermission('staff:manage'), async (c) => {
  const id = c.req.param('id');
  const user = await c.env.DB
    .prepare(
      `SELECT u.id, u.name, u.email, u.role_id,
              CASE WHEN u.pin_code IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
              r.role_name, r.hierarchy_level
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .bind(id)
    .first();
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ user });
});

// 新增員工（密碼與 PIN 皆以 bcrypt 雜湊儲存）
app.post(
  '/users',
  authMiddleware,
  checkPermission('staff:manage'),
  requireAdminWrite,
  async (c) => {
    const { name, email, password, pinCode, roleId } = await c.req.json<{
      name: string;
      email: string;
      password: string;
      pinCode?: string;
      roleId: number;
    }>();

    if (!name || !email || !password || !roleId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    if (pinCode && !/^\d{4,6}$/.test(pinCode)) {
      return c.json({ error: 'PIN must be 4-6 digits' }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();
    if (existing) {
      return c.json({ error: 'Email already exists' }, 409);
    }

    const passwordHash = await hashSecret(password);
    const pinHash = pinCode ? await hashSecret(pinCode) : null;
    const lookup = pinCode ? await pinLookup(pinCode) : null;

    const result = await c.env.DB
      .prepare(
        `INSERT INTO users (name, email, password_hash, pin_code, pin_lookup, role_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(name, email, passwordHash, pinHash, lookup, roleId)
      .run();

    return c.json({ success: true, userId: result.meta?.last_row_id }, 201);
  }
);

app.put(
  '/users/:id',
  authMiddleware,
  checkPermission('staff:manage'),
  requireAdminWrite,
  async (c) => {
    const id = c.req.param('id');
    const { name, email, password, pinCode, roleId } = await c.req.json<{
      name?: string;
      email?: string;
      password?: string;
      pinCode?: string | null;
      roleId?: number;
    }>();

    // 有提供密碼/PIN 時重新雜湊；未提供則保留原值
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await hashSecret(password);
    }

    let pinHash: string | null = null;
    let lookup: string | null = null;
    if (pinCode) {
      if (!/^\d{4,6}$/.test(pinCode)) {
        return c.json({ error: 'PIN must be 4-6 digits' }, 400);
      }
      pinHash = await hashSecret(pinCode);
      lookup = await pinLookup(pinCode);
    }

    await c.env.DB
      .prepare(
        `UPDATE users
         SET name        = COALESCE(?, name),
             email       = COALESCE(?, email),
             password_hash = COALESCE(?, password_hash),
             pin_code    = CASE WHEN ? THEN ? ELSE pin_code END,
             pin_lookup  = CASE WHEN ? THEN ? ELSE pin_lookup END,
             role_id     = COALESCE(?, role_id)
         WHERE id = ?`
      )
      .bind(
        name ?? null,
        email ?? null,
        passwordHash,
        pinHash ? 1 : 0,
        pinHash,
        pinHash ? 1 : 0,
        lookup,
        roleId ?? null,
        id
      )
      .run();

    return c.json({ success: true });
  }
);

app.delete(
  '/users/:id',
  authMiddleware,
  checkPermission('staff:manage'),
  requireAdminWrite,
  async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  }
);

// -------------------------------------------------------
// 角色管理
app.get('/roles', authMiddleware, async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM roles ORDER BY hierarchy_level DESC')
    .all();
  return c.json({ roles: results });
});

app.post('/roles', authMiddleware, requireRole(['Boss']), requireAdminWrite, async (c) => {
  const { roleName, hierarchyLevel } = await c.req.json<{
    roleName: string;
    hierarchyLevel: number;
  }>();
  const result = await c.env.DB
    .prepare('INSERT INTO roles (role_name, hierarchy_level) VALUES (?, ?)')
    .bind(roleName, hierarchyLevel)
    .run();
  return c.json({ success: true, roleId: result.meta?.last_row_id });
});

app.put(
  '/roles/:id',
  authMiddleware,
  requireRole(['Boss']),
  requireAdminWrite,
  async (c) => {
    const id = c.req.param('id');
    const { roleName, hierarchyLevel } = await c.req.json<{
      roleName?: string;
      hierarchyLevel?: number;
    }>();
    await c.env.DB
      .prepare(
        `UPDATE roles SET role_name = COALESCE(?, role_name),
                          hierarchy_level = COALESCE(?, hierarchy_level)
         WHERE id = ?`
      )
      .bind(roleName ?? null, hierarchyLevel ?? null, id)
      .run();
    return c.json({ success: true });
  }
);

app.delete(
  '/roles/:id',
  authMiddleware,
  requireRole(['Boss']),
  requireAdminWrite,
  async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  }
);

// -------------------------------------------------------
// 權限管理
app.get('/permissions', authMiddleware, async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM permissions ORDER BY permission_key')
    .all();
  return c.json({ permissions: results });
});

app.post(
  '/permissions',
  authMiddleware,
  requireRole(['Boss']),
  requireAdminWrite,
  async (c) => {
    const { permissionKey, name } = await c.req.json<{
      permissionKey: string;
      name: string;
    }>();
    await c.env.DB
      .prepare('INSERT INTO permissions (permission_key, name) VALUES (?, ?)')
      .bind(permissionKey, name)
      .run();
    return c.json({ success: true });
  }
);

// -------------------------------------------------------
// 取得目前登入者角色的權限清單 (前端動態按鈕顯示用)
app.get('/permissions/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.permission_key
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?`
    )
    .bind(user.roleId)
    .all<{ permission_key: string }>();
  return c.json({ permissions: (results ?? []).map((r) => r.permission_key) });
});

// -------------------------------------------------------
// 角色-權限對應 (動態按鈕權限配置)
app.get('/role-permissions', authMiddleware, async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT r.id as role_id, r.role_name, p.id as permission_id, p.permission_key, p.name
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
       ORDER BY r.hierarchy_level DESC, p.permission_key`
    )
    .all();
  return c.json({ rolePermissions: results });
});

app.post(
  '/role-permissions',
  authMiddleware,
  checkPermission('permission:manage'),
  requireAdminWrite,
  async (c) => {
    const { roleId, permissionId } = await c.req.json<{
      roleId: number;
      permissionId: number;
    }>();
    await c.env.DB
      .prepare(
        `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`
      )
      .bind(roleId, permissionId)
      .run();
    return c.json({ success: true });
  }
);

app.delete(
  '/role-permissions',
  authMiddleware,
  checkPermission('permission:manage'),
  requireAdminWrite,
  async (c) => {
    const { roleId, permissionId } = await c.req.json<{
      roleId: number;
      permissionId: number;
    }>();
    await c.env.DB
      .prepare(
        `DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?`
      )
      .bind(roleId, permissionId)
      .run();
    return c.json({ success: true });
  }
);

export default app;
