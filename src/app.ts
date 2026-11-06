import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppEnv } from './types';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import uploadRoutes from './routes/uploads';
import publicRoutes from './routes/public';

/**
 * 建立 Hono App。
 *
 * 同一份 App 同時供兩種執行環境使用：
 *  - Cloudflare Worker (src/index.ts)  ：env 來自 wrangler.toml 綁定
 *  - Node 本機 (server/local.ts)       ：env 注入本地 D1 + 本機檔案儲存
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // 全域 CORS (前端 Pages / Vite 呼叫 Worker API 所需)
  app.use('*', cors());

  // 健康檢查
  app.get('/health', (c) => c.json({ status: 'ok', service: 'pos-api' }));

  // 公開認證路由 (不需 JWT)
  app.route('/auth', authRoutes);

  // 公開端點 (顧客線上下單免登入)
  app.route('/menu', publicRoutes);

  // 檔案輸出 (公開，<img> 標籤無法帶 Authorization header)
  app.route('/uploads', uploadRoutes);

  // 受保護路由 (各子路由自行套用 authMiddleware)
  app.route('/admin', adminRoutes);
  app.route('/products', productRoutes);
  app.route('/orders', orderRoutes);

  return app;
}
