import { Hono } from 'hono';
import { AppEnv } from '../types';

const app = new Hono<AppEnv>();

/**
 * 公開端點 (顧客線上下單免登入)
 */

// 公開菜單 - 商品
app.get('/products', async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.category_id, c.name as category_name, p.name, p.price,
              p.image_key, p.is_available
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_available = 1
       ORDER BY c.sort_order ASC, p.name ASC`
    )
    .all();
  return c.json({ products: results });
});

// 公開菜單 - 分類
app.get('/categories', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
    .all();
  return c.json({ categories: results });
});

// 顧客線上下單 (免登入，user_id 為 NULL)
app.post('/orders', async (c) => {
  const { type, tableNumber, items } = await c.req.json<{
    type: 'dine_in' | 'takeaway';
    tableNumber?: string;
    items: { productId: number; quantity: number; unitPrice: number }[];
  }>();

  if (!items || items.length === 0) {
    return c.json({ error: 'Order must have at least one item' }, 400);
  }
  if (type !== 'dine_in' && type !== 'takeaway') {
    return c.json({ error: 'Invalid order type' }, 400);
  }

  // 以資料庫價格為準，避免前端竄改金額
  let totalAmount = 0;
  const trustedItems: { productId: number; quantity: number; unitPrice: number }[] = [];
  for (const item of items) {
    const product = await c.env.DB
      .prepare('SELECT id, price, is_available FROM products WHERE id = ?')
      .bind(item.productId)
      .first<{ id: number; price: number; is_available: number }>();

    if (!product || !product.is_available) {
      return c.json({ error: `Product ${item.productId} is unavailable` }, 400);
    }
    const quantity = Math.max(1, Math.floor(item.quantity));
    totalAmount += product.price * quantity;
    trustedItems.push({
      productId: product.id,
      quantity,
      unitPrice: product.price,
    });
  }

  const orderNumber = `WEB${Date.now().toString().slice(-6)}${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  const orderResult = await c.env.DB
    .prepare(
      `INSERT INTO orders (order_number, type, status, total_amount, discount_amount, user_id, table_number)
       VALUES (?, ?, 'pending', ?, 0, NULL, ?)`
    )
    .bind(orderNumber, type, totalAmount, tableNumber ?? null)
    .run();

  const orderId = orderResult.meta?.last_row_id;

  for (const item of trustedItems) {
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
      `SELECT id, order_number, type, status, total_amount, discount_amount, table_number, created_at
       FROM orders WHERE id = ?`
    )
    .bind(orderId)
    .first();

  return c.json({ success: true, order }, 201);
});

export default app;