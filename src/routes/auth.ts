import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { AppEnv, JWTPayload } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<AppEnv>();

/**
 * 員工快速登入 (4 位數 PIN)
 * 前端 POS 呼叫此介面，成功後回傳 JWT
 */
app.post('/login', async (c) => {
  const { email, password, pin } = await c.req.json<{
    email?: string;
    password?: string;
    pin?: string;
  }>();

  let userRow: any = null;

  if (pin) {
    // PIN 快速登入：以 pin_code 查找
    userRow = await c.env.DB
      .prepare(
        `SELECT u.id, u.name, u.email, u.password_hash, u.pin_code, u.role_id,
                r.role_name, r.hierarchy_level
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.pin_code = ?`
      )
      .bind(pin)
      .first();
  } else if (email && password) {
    // 帳號密碼登入（實務上應比對 bcrypt 雜湊，此處示範直接比對）
    userRow = await c.env.DB
      .prepare(
        `SELECT u.id, u.name, u.email, u.password_hash, u.pin_code, u.role_id,
                r.role_name, r.hierarchy_level
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.email = ?`
      )
      .bind(email)
      .first();
  }

  if (!userRow) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // 簡易密碼比對 (生產環境請改用 bcrypt/argon2 驗證)
  if (password && userRow.password_hash !== password) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const payload: JWTPayload = {
    userId: userRow.id,
    email: userRow.email,
    name: userRow.name,
    role: userRow.role_name,
    roleId: userRow.role_id,
    hierarchyLevel: userRow.hierarchy_level,
  };

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  return c.json({
    token,
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role_name,
      roleId: userRow.role_id,
      hierarchyLevel: userRow.hierarchy_level,
      pinCode: userRow.pin_code,
    },
  });
});

/**
 * 註冊新使用者 (僅 Boss/店長)
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

  const result = await c.env.DB
    .prepare(
      `INSERT INTO users (name, email, password_hash, pin_code, role_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(name, email, password, pinCode ?? null, roleId)
    .run();

  return c.json({
    success: true,
    userId: result.meta?.last_row_id,
  });
});

export default app;