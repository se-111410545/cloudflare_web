import { Hono } from 'hono';
import { AppEnv } from '../types';
import { createStorage } from '../storage';
import { authMiddleware, requireRole } from '../middleware/auth';

const app = new Hono<AppEnv>();

/**
 * 檔案輸出
 *
 * GET    /uploads/:key   讀取檔案（公開，供 <img> 直接引用）
 * DELETE /uploads/:key   刪除檔案（僅 Boss）
 */
app.get('/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const storage = createStorage(c.env);
  const file = await storage.get(key);

  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }

  return new Response(file.data, {
    headers: {
      'Content-Type': file.contentType || 'application/octet-stream',
      'Content-Length': String(file.size ?? file.data.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

app.delete('/:key', authMiddleware, requireRole(['Boss']), async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const storage = createStorage(c.env);
  await storage.delete(key);

  // 同步清除商品上的圖片參照
  await c.env.DB
    .prepare('UPDATE products SET image_key = NULL WHERE image_key = ?')
    .bind(key)
    .run();

  return c.json({ success: true });
});

export default app;
