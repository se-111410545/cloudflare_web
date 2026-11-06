# POS & Online Ordering System（Cloudflare 全端部署）

以 Cloudflare 生態系打造的全端 POS 點餐系統：**Hono (Workers) + D1 + R2 + React (Pages)**。

---

## 目錄結構

```
cloudflare_web/
├── wrangler.toml                  # Worker 設定（D1 / R2 / JWT_SECRET）
├── package.json                   # Worker 相依
├── tsconfig.json
├── migrations/
│   ├── 0001_initial.sql           # D1 Schema 建表
│   └── 0002_seed.sql              # 種子資料（角色/權限/員工/商品）
├── src/                           # Hono Worker 後端
│   ├── index.ts                   # App 進入點、路由掛載、CORS
│   ├── types/index.ts             # Env 與型別定義
│   ├── middleware/
│   │   └── auth.ts                # JWT 驗證 + RBAC + 動態權限中介軟體
│   └── routes/
│       ├── auth.ts                # 登入 (PIN/帳密)、註冊
│       ├── admin.ts               # 員工/角色/權限/角色權限對應
│       ├── products.ts            # 商品/分類 CRUD + R2 圖片上傳與輸出
│       ├── orders.ts              # POS 訂單建立、狀態更新、列表
│       └── public.ts              # 顧客免登入菜單與下單
└── frontend/                      # React + Vite + Tailwind（Cloudflare Pages）
    ├── wrangler.toml              # Pages 設定
    ├── vite.config.ts             # @ alias、/api 開發代理
    ├── tailwind.config.js
    ├── public/_redirects          # SPA 路由轉址
    └── src/
        ├── main.tsx
        ├── App.tsx                # 路由與角色守衛
        ├── index.css              # Tailwind 與元件樣式
        ├── lib/
        │   ├── api.ts             # fetch 封裝、JWT 注入、圖片 URL
        │   └── utils.ts
        ├── types/index.ts
        ├── context/AuthContext.tsx# 登入狀態與權限
        ├── hooks/
        │   ├── useAuth.ts
        │   └── usePermissions.ts  # 動態按鈕權限來源
        ├── components/
        │   ├── ui/                # button / card / input / label / dialog
        │   ├── ProductGrid.tsx    # 商品網格 + 分類 + 搜尋
        │   ├── CartPanel.tsx      # 購物車 + 折扣 + 付款模擬
        │   ├── DiscountButtons.tsx# ★ 依角色權限動態顯示
        │   └── OrderList.tsx      # 即時訂單與狀態操作
        └── pages/
            ├── Login.tsx          # PIN 快速登入
            ├── Pos.tsx            # POS 主畫面
            ├── Admin.tsx          # 後台管理
            └── Order.tsx          # 顧客線上點餐
```

---

## 快速開始

### 1. 安裝 Worker 相依

```bash
npm install
```

### 2. 建立 Cloudflare 資源

```bash
npx wrangler login

# D1 資料庫
npx wrangler d1 create pos-db
# → 將回傳的 database_id 填入 wrangler.toml

# R2 儲存桶
npx wrangler r2 bucket create pos-product-images
```

### 3. 執行資料庫遷移

```bash
npx wrangler d1 execute pos-db --file=migrations/0001_initial.sql
npx wrangler d1 execute pos-db --file=migrations/0002_seed.sql
```

本地開發時加上 `--local` 使用本地模擬資料庫：

```bash
npx wrangler d1 execute pos-db --local --file=migrations/0001_initial.sql
npx wrangler d1 execute pos-db --local --file=migrations/0002_seed.sql
```

### 4. 設定 JWT 密鑰

```bash
npx wrangler secret put JWT_SECRET
```

### 5. 啟動 Worker

```bash
npm run dev     # http://localhost:8787
```

### 6. 啟動前端

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

前端開發環境已設定 `/api` 代理至 `http://localhost:8787`。
若要以實際 Worker 網址呼叫，改用環境變數：

```bash
# frontend/.env
VITE_API_BASE=https://pos-api.<你的子網域>.workers.dev
```

---

## 測試帳號（種子資料）

| 角色 | 帳號 | 密碼 | PIN |
|---|---|---|---|
| Boss 老闆 | boss@example.com | password123 | 0001 |
| Store Manager 店長 | manager@example.com | password123 | 0002 |
| Supervisor 小主管 | supervisor@example.com | password123 | 0003 |
| Staff 一般員工 | staff@example.com | password123 | 0004 |

---

## 權限設計

### 階級 (hierarchy_level)

| 角色 | 階級 | 權限範圍 |
|---|---|---|
| Boss | 4 | 全部功能、動態權限設定、員工管理 |
| Store Manager | 3 | 商品管理、圖片上傳、一般折扣、銷售分析 |
| Supervisor | 2 | 標準折扣、取消訂單/退款 |
| Staff | 1 | 下單、結帳、查看進行中訂單 |

### 動態權限機制

權限的唯一真實來源為 `permissions` 與 `role_permissions` 兩張資料表。

1. Boss 於 `/admin` →「角色權限」勾選哪些角色可用哪些功能。
2. 前端 `usePermissions()` 呼叫 `GET /admin/permissions/me` 取得自身權限清單。
3. `DiscountButtons` 僅渲染已授權的折扣按鈕（例如 7 折僅店長以上出現）。
4. 後端 `checkPermission()` 中介軟體於 API 層再次驗證，防止前端繞過。

權限鍵值：

```
discount:none / discount:5 / discount:10 / discount:15
discount:20 / discount:30 / discount:50
order:cancel / order:refund
product:manage / product:upload
staff:manage / permission:manage / analytics:view
```

---

## API 摘要

### 公開端點

| Method | Path | 說明 |
|---|---|---|
| GET | `/health` | 健康檢查 |
| GET | `/menu/products` | 顧客菜單（僅上架商品） |
| GET | `/menu/categories` | 顧客分類 |
| POST | `/menu/orders` | 顧客線上下單（免登入，價格以 DB 為準） |
| GET | `/products/image/:key` | R2 商品圖片輸出 |

### 認證端點

| Method | Path | 說明 |
|---|---|---|
| POST | `/auth/login` | PIN 快速登入 / 帳密登入 → 取得 JWT |
| POST | `/auth/register` | 新增員工（僅 Boss） |

### 受保護端點（需 `Authorization: Bearer <token>`）

| Method | Path | 所需權限 |
|---|---|---|
| GET | `/admin/users` | `staff:manage` |
| POST | `/admin/users` | `staff:manage` |
| PUT / DELETE | `/admin/users/:id` | `staff:manage` |
| GET | `/admin/roles` | 登入即可 |
| POST / PUT / DELETE | `/admin/roles/:id` | Boss |
| GET | `/admin/permissions` | 登入即可 |
| POST | `/admin/permissions` | Boss |
| GET | `/admin/permissions/me` | 登入即可（取得自身權限清單） |
| GET | `/admin/role-permissions` | 登入即可 |
| POST / DELETE | `/admin/role-permissions` | `permission:manage` |
| GET | `/products/products` | 登入即可 |
| POST / PUT | `/products/products` | `product:manage` |
| DELETE | `/products/products/:id` | Boss |
| POST / PUT / DELETE | `/products/categories` | `product:manage` / Boss |
| POST | `/products/products/upload` | `product:upload` |
| POST | `/orders` | 登入即可 |
| GET | `/orders` | 登入即可 |
| PATCH | `/orders/:id/status` | 登入即可；取消/退款另需 `order:cancel` |
| DELETE | `/orders/:id` | Boss |

> 標註為權限名稱者由 `role_permissions` 資料表驅動，Boss 可於後台即時調整；
> 標註為 Boss 者為固定角色限制。

---

## 部署

```bash
# 後端 Worker
npm run deploy

# 前端 Cloudflare Pages（於 frontend 目錄）
cd frontend
npm run build
npx wrangler pages deploy dist --project-name pos-frontend
```

部署後請於 Cloudflare Pages 設定環境變數 `VITE_API_BASE` 指向 Worker 網址，
並將 Worker 網址加入 Pages 的 CORS 允許清單（Worker 已使用 `hono/cors` 預設開放）。

---

## 已知待辦

- [ ] 密碼改為 bcrypt / Argon2 雜湊（目前為示範用明文比對）
- [ ] PIN 登入加入嘗試次數限制與鎖定
- [ ] D1 schema 使用 `wrangler d1 migrations` 目錄化管理
- [ ] 線上訂單即時推播（可接 WebSocket Durable Object 或 Cloudflare Pub/Sub）
- [ ] 銷售分析報表頁面
- [ ] 訂單列印（thermal printer / ESC-POS）
