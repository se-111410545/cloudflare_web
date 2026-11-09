import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { AppEnv, JWTPayload } from '../types';
import { authMiddleware } from '../middleware/auth';
import { verifyPin, verifySecret, isBcryptHash, hashSecret } from '../lib/password';
import { pinLookup } from '../lib/pin-lookup';
import { resolveAdminScope, downgradeBossRole } from '../middleware/admin-guard';

const app = new Hono<AppEnv>();

/**
 * 員工快速登入 (4-6 位數 PIN) / 帳密登入
 *
 * 憑證一律以 bcrypt 雜湊比對。
 * 舊版種子資料中的明文 PIN 將被視為無效（isBcryptHash 檢查），
 * 需以 `npm run db:reset-admin` 重新設定雜湊。
 */
app.post('/login', async (c) => {
  const { email, password, pin } = await c.req.json<{
    email?: string;
    password?: string;
    pin?: string;
  }>();

  let userRow: any = null;

  if (pin) {
    // PIN 快速登入：以 lookup 雜湊索引定位，再以 bcrypt 驗證
    if (!/^\d{4,6}$/.test(pin)) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    userRow = await c.env.DB
      .prepare(
        `SELECT u.id, u.name, u.email, u.password_hash, u.pin_code, u.role_id,
                r.role_name, r.hierarchy_level
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.pin_lookup = ?`
      )
      .bind(await pinLookup(pin))
      .first();
  } else if (email && password) {
    // 帳號密碼登入
    userRow = await c.env.DB
      .prepare(
        `SELECT u.id, u.name, u.email, u.password_hash, u.pin_code, u.role_id,
                r.role_name, r.hierarchy_level
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.email = ?`
      )
      .bind(email)
      .first();
  } else {
    return c.json({ error: 'Missing credentials' }, 400);
  }

  if (!userRow) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // 驗證：PIN 走 bcrypt.compare，密碼走 bcrypt.compare
  let valid = false;
  if (pin) {
    valid = await verifyPin(pin, userRow.pin_code);
  } else {
    valid = await verifySecret(password as string, userRow.password_hash);
  }

  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const adminScope = resolveAdminScope(c);
  const remoteLocked = adminScope === 'restricted';

  let payload: JWTPayload = {
    userId: userRow.id,
    email: userRow.email,
    name: userRow.name,
    role: userRow.role_name,
    roleId: userRow.role_id,
    hierarchyLevel: userRow.hierarchy_level,
    adminScope,
  };

  // 遠端鎖定：Boss 一併降級（role 與 roleId 同時更換，
  // 否則後續 checkPermission 仍會以 Boss 角色判定權限）
  if (remoteLocked && userRow.role_name === 'Boss') {
    payload = await downgradeBossRole(c, payload);
  }

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  return c.json({
    token,
    adminScope,
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: payload.role,
      roleId: userRow.role_id,
      hierarchyLevel: payload.hierarchyLevel,
      hasPin: isBcryptHash(userRow.pin_code),
    },
  });
});

/**
 * 查詢目前登入者資訊
 */
app.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const row = await c.env.DB
    .prepare(
      `SELECT u.id, u.name, u.email, u.role_id, r.role_name, r.hierarchy_level
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .bind(user.userId)
    .first();

  if (!row) return c.json({ error: 'User not found' }, 404);

  return c.json({
    user: row,
    adminScope: user.adminScope ?? resolveAdminScope(c),
  });
});

/**
 * 註冊新使用者（僅 Boss，且管理寫入未被封鎖）
 */
app.post('/register', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'Boss') {
    return c.json({ error: 'Only Boss can register users' }, 403);
  }

  const { name, email, password, pinCode, roleId } = await c.req.json<{
    name: string;
    email: string;
    password: string;
    pinCode?: string;
    roleId: number;
  }>();

  const existing = await c.env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) {
    return c.json({ error: 'Email already exists' }, 409);
  }

  // 密碼與 PIN 皆以 bcrypt 雜湊儲存
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

  return c.json({ success: true, userId: result.meta?.last_row_id });
});

export default app;
