import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppEnv } from './types';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import publicRoutes from './routes/public';

const app = new Hono<AppEnv>();

// 全域 CORS (前端 Pages 呼叫 Worker API 所需)
app.use('*', cors());

// 健康檢查
app.get('/health', (c) => c.json({ status: 'ok', service: 'pos-api' }));

// 公開認證路由 (不需 JWT)
app.route('/auth', authRoutes);

// 公開端點 (顧客線上下單免登入)
app.route('/menu', publicRoutes);

// 受保護路由 (需 JWT)
app.use('/admin/*', async (c, next) => {
  // 套用 authMiddleware 行為：這裡由各子路由自行加 authMiddleware
  await next();
});
app.use('/products/*', async (c, next) => {
  await next();
});
app.use('/orders/*', async (c, next) => {
  await next();
});

app.route('/admin', adminRoutes);
app.route('/products', productRoutes);
app.route('/orders', orderRoutes);

export default app;