import { Hono } from 'hono';
import { AppEnv } from '../types';
import { authMiddleware, requireRole, requireMinHierarchy, checkPermission } from '../middleware/auth';

const app = new Hono<AppEnv>();

// -------------------------------------------------------
// 分類 CRUD
app.get('/categories', authMiddleware, async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
    .all();
  return c.json({ categories: results });
});

app.post('/categories', authMiddleware, checkPermission('product:manage'), async (c) => {
  const { name, sortOrder } = await c.req.json<{ name: string; sortOrder?: number }>();
  const result = await c.env.DB
    .prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
    .bind(name, sortOrder ?? 0)
    .run();
  return c.json({ success: true, categoryId: result.meta?.last_row_id });
});

app.put('/categories/:id', authMiddleware, checkPermission('product:manage'), async (c) => {
  const id = c.req.param('id');
  const { name, sortOrder } = await c.req.json<{ name?: string; sortOrder?: number }>();
  await c.env.DB
    .prepare(`UPDATE categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?`)
    .bind(name ?? null, sortOrder ?? null, id)
    .run();
  return c.json({ success: true });
});

app.delete('/categories/:id', authMiddleware, requireRole(['Boss']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// -------------------------------------------------------
// 商品 CRUD
app.get('/products', authMiddleware, async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.category_id, c.name as category_name, p.name, p.price,
              p.image_r2_key, p.is_available, p.created_at
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY c.sort_order ASC, p.name ASC`
    )
    .all();
  return c.json({ products: results });
});

app.post('/products', authMiddleware, checkPermission('product:manage'), async (c) => {
  const { categoryId, name, price, isAvailable } = await c.req.json<{
    categoryId: number;
    name: string;
    price: number;
    isAvailable?: boolean;
  }>();
  const result = await c.env.DB
    .prepare(
      `INSERT INTO products (category_id, name, price, is_available)
       VALUES (?, ?, ?, ?)`
    )
    .bind(categoryId, name, price, isAvailable ?? true ? 1 : 0)
    .run();
  return c.json({ success: true, productId: result.meta?.last_row_id });
});

app.put('/products/:id', authMiddleware, checkPermission('product:manage'), async (c) => {
  const id = c.req.param('id');
  const { categoryId, name, price, imageR2Key, isAvailable } = await c.req.json<{
    categoryId?: number;
    name?: string;
    price?: number;
    imageR2Key?: string;
    isAvailable?: boolean;
  }>();
  await c.env.DB
    .prepare(
      `UPDATE products SET category_id = COALESCE(?, category_id), name = COALESCE(?, name),
                          price = COALESCE(?, price), image_r2_key = COALESCE(?, image_r2_key),
                          is_available = COALESCE(?, is_available)
       WHERE id = ?`
    )
    .bind(
      categoryId ?? null,
      name ?? null,
      price ?? null,
      imageR2Key ?? null,
      isAvailable ?? null,
      id
    )
    .run();
  return c.json({ success: true });
});

app.delete('/products/:id', authMiddleware, requireRole(['Boss']), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// -------------------------------------------------------
// R2 商品圖片讀取 (私有桶由 Worker 代理輸出)
app.get('/image/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const object = await c.env.BUCKET.get(key);
  if (!object) {
    return c.json({ error: 'Image not found' }, 404);
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// -------------------------------------------------------
// R2 商品圖片上傳
app.post('/products/upload', authMiddleware, checkPermission('product:upload'), async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as unknown as File;
  const productId = formData.get('productId') as string;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const key = `products/${Date.now()}_${file.name}`;

  await c.env.BUCKET.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  });

  // 如果有 productId，更新商品的 image_r2_key
  if (productId) {
    await c.env.DB
      .prepare('UPDATE products SET image_r2_key = ? WHERE id = ?')
      .bind(key, productId)
      .run();
  }

  return c.json({
    success: true,
    key,
    url: `/products/image/${encodeURIComponent(key)}`,
  });
});

app.delete('/products/upload/:key', authMiddleware, requireRole(['Boss']), async (c) => {
  const key = c.req.param('key');
  await c.env.BUCKET.delete(key);
  return c.json({ success: true });
});

export default app;