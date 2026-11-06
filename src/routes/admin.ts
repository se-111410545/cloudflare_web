import { Hono } from 'hono';
import { AppEnv } from '../types';
import { authMiddleware, requireRole, requireMinHierarchy, checkPermission } from '../middleware/auth';

const app = new Hono<AppEnv>();

// -------------------------------------------------------
// 使用者管理 (僅 Boss)
app.get('/users', authMiddleware, checkPermission('staff:manage'), async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT u.id, u.name, u.email, u.pin_code, u.role_id, u.created_at,
              r.role_name, r.hierarchy_level
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    )
    .all();
  return c.json({ users: results });
});

// 新增員工
app.post('/users', authMiddleware, checkPermission('staff:manage'), async (c) => {
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

  const existing = await c.env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) {
    return c.json({ error: 'Email already exists' }, 409);
  }

  const result = await c.env.DB
    .prepare(
      `INSERT INTO users (name, email, password_hash, pin_code, role_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(name, email, password, pinCode ?? null, roleId)
    .run();

  return c.json({ success: true, userId: result.meta?.last_row_id }, 201);
});

app.get('/users/:id', authMiddleware, checkPermission('staff:manage'), async (c) => {
  const id = c.req.param('id');
  const user = await c.env.DB
    .prepare(
      `SELECT u.id, u.name, u.email, u.pin_code, u.role_id,
              r.role_name, r.hierarchy_level
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .bind(id)
    .first();
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ user });
});

app.put('/users/:id', authMiddleware, checkPermission('staff:manage'), async (c) => {
  const id = c.req.param('id');
  const { name, email, pinCode, roleId } = await c.req.json<{
    name?: string;
    email?: string;
    pinCode?: string;
    roleId?: number;
  }>();
  await c.env.DB
    .prepare(
      `UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email),
                        pin_code = COALESCE(?, pin_code), role_id = COALESCE(?, role_id)
       WHERE id = ?`
    )
    .bind(name ?? null, email ?? null, pinCode ?? null, roleId ?? null, id)
    .run();
  return c.json({ success: true });
});

app.delete('/users/:id', authMiddleware, checkPermission('staff:manage'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// -------------------------------------------------------
// 角色管理
app.get('/roles', authMiddleware, async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM roles ORDER BY hierarchy_level DESC')
    .all();
  return c.json({ roles: results });
});

app.post('/roles', authMiddleware, requireRole(['Boss']), async (c) => {
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

app.put('/roles/:id', authMiddleware, requireRole(['Boss']), async (c) => {
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
});

app.delete('/roles/:id', authMiddleware, requireRole(['Boss']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// -------------------------------------------------------
// 權限管理
app.get('/permissions', authMiddleware, async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM permissions ORDER BY permission_key')
    .all();
  return c.json({ permissions: results });
});

app.post('/permissions', authMiddleware, requireRole(['Boss']), async (c) => {
  const { permissionKey, name } = await c.req.json<{
    permissionKey: string;
    name: string;
  }>();
  await c.env.DB
    .prepare('INSERT INTO permissions (permission_key, name) VALUES (?, ?)')
    .bind(permissionKey, name)
    .run();
  return c.json({ success: true });
});

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

app.post('/role-permissions', authMiddleware, checkPermission('permission:manage'), async (c) => {
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
});

app.delete('/role-permissions', authMiddleware, checkPermission('permission:manage'), async (c) => {
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
});

export default app;