import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { AppEnv } from './types';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import uploadRoutes from './routes/uploads';
import publicRoutes from './routes/public';

/**
 * SPA fallback
 *
 * 當請求路徑不是 API 路由時（例如 /pos、/admin、/order、/assets/xxx.js），
 * 回傳前端 index.html 讓前端路由接管。
 *
 * 靜態資產由 Cloudflare 直接提供（wrangler.toml 的 [assets]），
 * 但列在 run_worker_first 的路徑會先進入 Worker，因此這裡需要自行處理。
 */
async function spaFallback(c: Context<AppEnv>): Promise<Response> {
  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    return c.json({ error: 'Not Found' }, 404);
  }

  const assets = c.env.ASSETS;
  if (assets) {
    // 1. 先嘗試直接取得靜態資產
    try {
      const direct = await assets.fetch(new Request(new URL(c.req.path, c.req.url)));
      if (direct.status !== 404) return direct;
    } catch {
      // 忽略，改走 index.html
    }

    // 2. SPA fallback：回傳 index.html
    try {
      const index = await assets.fetch(new Request(new URL('/index.html', c.req.url)));
      if (index.status === 200) {
        const headers = new Headers(index.headers);
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Cache-Control', 'no-cache');
        return new Response(index.body, { status: 200, headers });
      }
    } catch {
      // 忽略
    }
  }

  return c.json(
    {
      error: 'Not Found',
      hint: '前端尚未建置。請執行 `npm run build:frontend` 後重新部署。',
    },
    404
  );
}

/**
 * 建立 Hono App。
 *
 * 同一份 App 同時供兩種執行環境使用：
 *  - Cloudflare Worker (src/index.ts)  ：env 來自 wrangler.toml 綁定
 *  - Node 本機 (server/local.ts)       ：env 注入本地 D1 + 本機檔案儲存
 *
 * API 同時掛載於根路徑與 /api 前綴：
 *  - 根路徑：/orders、/products…（方便直接呼叫與測試）
 *  - /api/*：前端固定使用，與 SPA 路由 (/admin、/pos) 不會衝突
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // 全域 CORS (前端 Pages / Vite 呼叫 Worker API 所需)
  app.use('*', cors());

  // 健康檢查
  app.get('/health', (c) => c.json({ status: 'ok', service: 'pos-api' }));
  app.get('/api/health', (c) => c.json({ status: 'ok', service: 'pos-api' }));

  // API 路由（兩種前綴）
  for (const prefix of ['', '/api']) {
    app.route(`${prefix}/auth`, authRoutes);
    app.route(`${prefix}/menu`, publicRoutes);
    app.route(`${prefix}/uploads`, uploadRoutes);
    app.route(`${prefix}/admin`, adminRoutes);
    app.route(`${prefix}/products`, productRoutes);
    app.route(`${prefix}/orders`, orderRoutes);
  }

  // SPA fallback（必須放在所有 API 路由之後）
  app.all('*', spaFallback);

  return app;
}
