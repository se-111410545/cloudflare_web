import { Hono } from 'hono';
import { AppEnv } from '../types';
import { authMiddleware, requireRole, checkPermission } from '../middleware/auth';
import { createStorage } from '../storage';

const app = new Hono<AppEnv>();

/** 允許的上傳大小上限（5 MB） */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 允許的圖片 MIME 類型 */
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
];

/**
 * 產生安全的檔案鍵（避免路徑穿越與特殊字元）
 */
function buildFileKey(originalName: string): string {
  const ext = (originalName.split('.').pop() || 'bin')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  const base =
    originalName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'file';
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}_${rand}_${base}.${ext}`;
}

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
    .prepare(
      `UPDATE categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?`
    )
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
              p.image_key, p.is_available, p.created_at
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
  const { categoryId, name, price, imageKey, isAvailable } = await c.req.json<{
    categoryId?: number;
    name?: string;
    price?: number;
    imageKey?: string | null;
    isAvailable?: boolean;
  }>();

  // 取出舊圖片鍵，若被替換則刪除舊檔案
  const existing = await c.env.DB
    .prepare('SELECT image_key FROM products WHERE id = ?')
    .bind(id)
    .first<{ image_key: string | null }>();

  await c.env.DB
    .prepare(
      `UPDATE products SET category_id = COALESCE(?, category_id), name = COALESCE(?, name),
                          price = COALESCE(?, price), image_key = COALESCE(?, image_key),
                          is_available = COALESCE(?, is_available)
       WHERE id = ?`
    )
    .bind(
      categoryId ?? null,
      name ?? null,
      price ?? null,
      imageKey ?? null,
      isAvailable ?? null,
      id
    )
    .run();

  if (existing?.image_key && imageKey !== undefined && imageKey !== existing.image_key) {
    await createStorage(c.env).delete(existing.image_key);
  }

  return c.json({ success: true });
});

app.delete('/products/:id', authMiddleware, requireRole(['Boss']), async (c) => {
  const id = c.req.param('id');

  // 先取得圖片鍵並刪除實體檔案
  const product = await c.env.DB
    .prepare('SELECT image_key FROM products WHERE id = ?')
    .bind(id)
    .first<{ image_key: string | null }>();

  if (product?.image_key) {
    await createStorage(c.env).delete(product.image_key);
  }

  await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// -------------------------------------------------------
// 圖片上傳（multipart/form-data）
// 檔案寫入本機 uploads/ 資料夾（Node 執行環境）或 D1 BLOB 後備方案
app.post('/products/upload', authMiddleware, checkPermission('product:upload'), async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as unknown as File;
  const productId = formData.get('productId') as string | null;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return c.json(
      { error: `Unsupported file type: ${file.type || 'unknown'} (allowed: ${ALLOWED_IMAGE_TYPES.join(', ')})` },
      400
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File too large (max 5MB)' }, 400);
  }

  const buffer = await file.arrayBuffer();
  const key = buildFileKey(file.name);

  const storage = createStorage(c.env);
  await storage.put(key, buffer, file.type);

  // 有指定商品時同步更新 image_key
  if (productId) {
    await c.env.DB
      .prepare('UPDATE products SET image_key = ? WHERE id = ?')
      .bind(key, productId)
      .run();
  }

  return c.json({
    success: true,
    key,
    url: `/uploads/${encodeURIComponent(key)}`,
    size: buffer.byteLength,
    contentType: file.type,
  });
});

export default app;
