import { Hono } from 'hono';
import { AppEnv } from '../types';
import { authMiddleware, requireRole, requireMinHierarchy, checkPermission } from '../middleware/auth';
import { requireAdminWrite } from '../middleware/admin-guard';

const app = new Hono<AppEnv>();

// 產生訂單號
function generateOrderNumber() {
  const prefix = 'POS';
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${ts}${rand}`;
}

// -------------------------------------------------------
// 建立訂單 (POS 下單 / 線上下單)
app.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const { type, tableNumber, items, discountAmount = 0 } = await c.req.json<{
    type: 'dine_in' | 'takeaway';
    tableNumber?: string;
    items: { productId: number; quantity: number; unitPrice: number }[];
    discountAmount?: number;
  }>();

  if (!items || items.length === 0) {
    return c.json({ error: 'Order must have at least one item' }, 400);
  }

  const orderNumber = generateOrderNumber();
  let totalAmount = 0;
  for (const item of items) {
    totalAmount += item.unitPrice * item.quantity;
  }
  totalAmount = Math.max(0, totalAmount - (discountAmount || 0));

  // 插入訂單
  const orderResult = await c.env.DB
    .prepare(
      `INSERT INTO orders (order_number, type, status, total_amount, discount_amount, user_id, table_number)
       VALUES (?, ?, 'pending', ?, ?, ?, ?)`
    )
    .bind(orderNumber, type, totalAmount, discountAmount, user.userId, tableNumber ?? null)
    .run();

  const orderId = orderResult.meta?.last_row_id;

  // 插入訂單明細
  for (const item of items) {
    await c.env.DB
      .prepare(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)`
      )
      .bind(orderId, item.productId, item.quantity, item.unitPrice)
      .run();
  }

  const order = await c.env.DB
    .prepare(
      `SELECT o.id, o.order_number, o.type, o.status, o.total_amount, o.discount_amount,
              o.table_number, o.created_at, u.name as cashier_name
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`
    )
    .bind(orderId)
    .first();

  return c.json({ success: true, order }, 201);
});

// -------------------------------------------------------
// 訂單列表 (POS 監看 / 管理後台)
app.get('/', authMiddleware, async (c) => {
  const { status, type, limit = '50', offset = '0' } = c.req.query();

  let sql = `
    SELECT o.id, o.order_number, o.type, o.status, o.total_amount, o.discount_amount,
           o.table_number, o.created_at, u.name as cashier_name
    FROM orders o LEFT JOIN users u ON u.id = o.user_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status) {
    sql += ` AND o.status = ?`;
    params.push(status);
  }
  if (type) {
    sql += ` AND o.type = ?`;
    params.push(type);
  }
  sql += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ orders: results });
});

app.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const order = await c.env.DB
    .prepare(
      `SELECT o.id, o.order_number, o.type, o.status, o.total_amount, o.discount_amount,
              o.table_number, o.created_at, u.name as cashier_name, u.id as cashier_id
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`
    )
    .bind(id)
    .first();
  if (!order) return c.json({ error: 'Order not found' }, 404);

  const { results: items } = await c.env.DB
    .prepare(
      `SELECT oi.id, oi.product_id, p.name as product_name, oi.quantity, oi.unit_price
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`
    )
    .bind(id)
    .all();

  return c.json({ order, items });
});

// -------------------------------------------------------
// 更新訂單狀態
// 一般狀態流轉 (pending -> preparing -> completed) 為所有登入者皆可
// 但取消/退款需具備 order:cancel 動態權限 (小主管以上預設有)
app.patch('/:id/status', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json<{ status: string }>();
  const valid = ['pending', 'preparing', 'completed', 'cancelled'];
  if (!valid.includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  if (status === 'cancelled') {
    const user = c.get('user');
    const allowed = await c.env.DB
      .prepare(
        `SELECT rp.permission_id
         FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ? AND p.permission_key = 'order:cancel'`
      )
      .bind(user.roleId)
      .first();
    if (!allowed) {
      return c.json({ error: 'Forbidden: missing permission order:cancel' }, 403);
    }
  }

  await c.env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(status, id).run();
  return c.json({ success: true });
});

// -------------------------------------------------------
// 刪除訂單 (僅 Boss，且受遠端管理寫入守門保護)
app.delete(
  '/:id',
  authMiddleware,
  requireRole(['Boss']),
  requireAdminWrite,
  async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  }
);

export default app;