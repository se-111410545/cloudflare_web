# POS & Online Ordering System（Cloudflare 全端部署）

以 Cloudflare 生態系打造的全端 POS 點餐系統：**Hono (Workers) + D1 + React (Pages)**。
檔案儲存已改為**本機檔案儲存**，本機開發完全離線、不需連線 Cloudflare。

---

## 目錄結構

```
cloudflare_web/
├── wrangler.toml                  # Worker 設定（D1 / ALLOW_REMOTE_ADMIN，已無 R2）
├── package.json                   # 根目錄 scripts（含 db:migrate 等）
├── tsconfig.json                  # Worker 型別檢查
├── tsconfig.server.json           # Node 本機伺服器型別檢查
├── .env.example                   # ★ 環境變數範例（複製成 .env 後修改）
├── migrations/                    # D1 Schema 遷移（由 scripts/migrate.mjs 套用）
│   ├── 0001_initial.sql
│   ├── 0002_local_storage.sql     # image_r2_key → image_key、uploads 資料表
│   ├── 0003_products_unique_index.sql
│   ├── 0004_uploads_base64.sql    # D1 BLOB 改 base64 TEXT
│   └── 0005_credential_hardening.sql # 明文憑證失效 + pin_lookup
├── seeds/
│   └── 001_demo_data.sql          # 種子資料（角色/權限/商品，不含憑證）
├── scripts/
│   ├── migrate.mjs                # 遷移執行器（自動記錄已套用檔案）
│   ├── local-db.mjs               # 本機 D1 指標檔（記錄 database_id 對應的 SQLite）
│   ├── seed.mjs                   # 種子（含 bcrypt 雜湊的使用者憑證）
│   ├── reset-admin.mjs            # 重設管理者 PIN／密碼
│   ├── env.mjs                    # .env 解析器
│   ├── sync-dev-vars.mjs          # .env → .dev.vars（供 wrangler dev）
│   ├── reset-db.mjs               # 重設本機資料庫
│   └── query.mjs                  # 查詢本機 D1
├── server/                        # Node 本機執行環境（可寫本機檔案）
│   ├── local.ts                   # 本機伺服器進入點
│   ├── d1-local.ts                # D1Database 相容層（node:sqlite）
│   ├── storage-disk.ts            # 本機檔案儲存（uploads/）
│   └── paths.ts                   # 路徑解析
├── uploads/                       # ★ 本機圖片儲存目錄（已 git 忽略）
├── src/                           # Hono Worker 後端
│   ├── app.ts                     # App 工廠（Worker 與 Node 共用）
│   ├── index.ts                   # Worker 進入點
│   ├── storage/                   # 檔案儲存抽象層
│   │   ├── types.ts               # FileStorage 介面
│   │   ├── d1-blob.ts             # D1 BLOB 後備實作
│   │   └── index.ts               # createStorage() 解析
│   ├── types/index.ts
│   ├── lib/
│   │   ├── password.ts            # bcrypt 雜湊與驗證
│   │   └── pin-lookup.ts          # PIN 查詢雜湊（sha256，供索引查找）
│   ├── middleware/
│   │   ├── auth.ts                # JWT + RBAC + 動態權限
│   │   └── admin-guard.ts         # ★ 管理權限的環境隔離
│   └── routes/
│       ├── auth.ts                # 登入 (PIN/帳密)、註冊
│       ├── admin.ts               # 員工/角色/權限對應
│       ├── products.ts            # 商品/分類 CRUD + 圖片上傳
│       ├── orders.ts              # 訂單建立、狀態流轉
│       ├── uploads.ts             # 檔案輸出/刪除
│       └── public.ts              # 顧客免登入菜單與下單
└── frontend/                      # React + Vite + Tailwind
    ├── vite.config.ts             # @ alias、/api 代理（含 rewrite）
    └── src/
        ├── App.tsx, main.tsx, index.css
        ├── lib/api.ts             # fetch 封裝、圖片 URL
        ├── types/index.ts
        ├── context/AuthContext.tsx
        ├── hooks/usePermissions.ts# 動態按鈕權限來源
        ├── components/
        │   ├── ui/                # button / card / input / label / dialog
        │   ├── ProductGrid.tsx, CartPanel.tsx, OrderList.tsx
        │   └── DiscountButtons.tsx# ★ 依角色權限動態顯示
        └── pages/
            ├── Login.tsx          # PIN 快速登入
            ├── Pos.tsx            # POS 主畫面
            ├── Admin.tsx          # 後台管理
            └── Order.tsx          # 顧客線上點餐
```

---

## 🚀 本機開發環境（離線，不需要 Cloudflare）

### 一次設定

```bash
npm install
npm --prefix frontend install

# ★ 建立本機環境變數並設定你自己的管理者 PIN
cp .env.example .env
```

接著編輯 `.env`，至少設定 `ADMIN_PIN` 與 `ADMIN_PASSWORD`：

```bash
ADMIN_PIN="你自己的 4-6 位數 PIN"        # 不要用 0001 / 1234 等常見值
ADMIN_PASSWORD="你自己的登入密碼"
```

### 啟動（三個終端機，或分開執行）

```bash
# 終端機 1：初始化資料庫（只需執行一次）
npm run db:setup        # = db:migrate + db:seed（會讀取 .env 的 ADMIN_PIN）

# 終端機 2：啟動後端 API（http://127.0.0.1:8787）
npm run dev

# 終端機 3：啟動前端（http://localhost:5173）
npm run dev:web
```

開啟瀏覽器 → <http://localhost:5173>

> **注意**：前端請用 `localhost` 開啟（Vite 5 在 Windows 上綁 IPv6 `::1`，
> 用 `127.0.0.1:5173` 會連不上）。

### 測試帳號

| 角色 | 帳號 | PIN | 密碼 |
|---|---|---|---|
| Boss 老闆 | boss@example.com | `.env` 的 `ADMIN_PIN` | `.env` 的 `ADMIN_PASSWORD` |
| Store Manager 店長 | manager@example.com | `.env` 的 `MANAGER_PIN`，未設定則隨機產生 | 同 PIN |
| Supervisor 小主管 | supervisor@example.com | `.env` 的 `SUPERVISOR_PIN`，未設定則隨機產生 | 同 PIN |
| Staff 一般員工 | staff@example.com | `.env` 的 `STAFF_PIN`，未設定則隨機產生 | 同 PIN |

> 未在 `.env` 設定的 PIN 會由種子腳本**隨機產生並於執行結果中顯示**，
> 不再使用任何硬編碼的預設值（避免對話紀錄或公開程式碼洩漏）。

### 更換自己的 PIN

```bash
npm run db:reset-admin              # 本機，互動式輸入（輸入時不會顯示）
npm run db:reset-admin -- --pin 8642  # 直接指定
npm run db:reset-admin -- --remote  # 同步更新雲端 D1
```

重設後舊 PIN 立即失效，新的 PIN 以 bcrypt 雜湊寫入。

---

## 🔐 安全設計

### 1. 憑證一律以 bcrypt 雜湊儲存

- 密碼與 PIN 都以 **bcrypt**（bcryptjs 3.x，純 JS，Worker 可用）雜湊後寫入 D1
- `verifySecret()` 會先檢查字串是否為合法 bcrypt 雜湊格式；
  **非 bcrypt 格式一律視為無效，絕不進行明文比對**
  → 舊版種子資料中的明文 PIN／密碼自動失效
- API 回應不再包含 `pin_code` 欄位，避免雜湊外洩

**PIN 查詢欄位（`pin_lookup`）**

bcrypt 使用隨機鹽，同一 PIN 每次產生的雜湊都不同，無法用 `WHERE pin_code = ?`
索引查找。因此額外存一欄 SHA-256 的 `pin_lookup` 供快速定位候選使用者：

```
登入流程：pin → sha256("pos-pin:" + pin) → 索引查到該員工 → bcrypt.compare() 驗證
```

驗證權威仍是 bcrypt；`pin_lookup` 僅用於「找出是哪位員工」。

### 2. 管理者權限的環境隔離

`src/middleware/admin-guard.ts` 依請求來源分成兩種模式：

| 環境 | 判定 | 管理寫入 | Boss 權限 |
|---|---|---|---|
| 本機 | hostname 為 `localhost` / `127.0.0.1` | ✅ 完整可用 | Boss（完整） |
| 線上 + `ALLOW_REMOTE_ADMIN` 未設定 | hostname 為 `*.workers.dev` 等 | ❌ 封鎖高風險寫入 | 降級為 Store Manager |
| 線上 + `ALLOW_REMOTE_ADMIN=true` | 同上 | ✅ 完整可用 | Boss（完整） |

**遠端鎖定時被封鎖的高風險操作：**

- 新增 / 修改 / 刪除員工（`staff:manage`）
- 新增 / 修改角色權限對應（`permission:manage`）
- 新增 / 修改 / 刪除商品與分類（`product:manage`）
- 上傳 / 刪除檔案
- 刪除訂單

**不受影響的日常 POS 作業**：下單、結帳、訂單狀態流轉（待處理→製作中→完成）、
顧客線上下單、瀏覽菜單。

降級時會**一併更換 `roleId`**（Boss → Store Manager），
確保 `checkPermission()` 依新角色判斷權限，而非沿用 Boss 的權限。

前端也會依 `adminScope` 顯示黃色警示橫幅並停用相關按鈕，
但真正的防護在後端 API 層（前端停用僅為操作體驗）。

### 3. 環境變數

`.env` 是設定的唯一來源（已 git 忽略），`.env.example` 為範例：

| 變數 | 用途 |
|---|---|
| `JWT_SECRET` | JWT 簽章密鑰（本機；正式環境用 `wrangler secret put`） |
| `ADMIN_PIN` | Boss 的 PIN（**必填**，4-6 位數） |
| `ADMIN_PASSWORD` | Boss 的登入密碼（**必填**） |
| `MANAGER_PIN` / `SUPERVISOR_PIN` / `STAFF_PIN` | 其他角色 PIN（選填，未設定則隨機產生） |
| `ALLOW_REMOTE_ADMIN` | 是否允許遠端管理寫入（預設 `false`） |

`npm run dev:worker` 會自動把 `.env` 同步成 `.dev.vars`（wrangler dev 只讀 `.dev.vars`）。

正式環境的 `JWT_SECRET` 與 `ALLOW_REMOTE_ADMIN` 使用 Cloudflare secret：

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ALLOW_REMOTE_ADMIN   # 輸入 true 才開放遠端管理
```

---

## 資料庫指令

所有指令都**自動以專案根目錄為工作目錄**，無論你在哪個目錄執行都能正確運作
（這修正了先前 `d1 execute --file=migrations/...` 找不到檔案的問題）。

| 指令 | 說明 |
|---|---|
| `npm run db:migrate` | 套用 `migrations/*.sql`（本機 `--local`），自動跳過已套用者 |
| `npm run db:migrate:remote` | 同上，但套用至雲端 D1 |
| `npm run db:seed` | 匯入種子 + 以 bcrypt 寫入使用者憑證（讀取 `.env`） |
| `npm run db:seed:remote` | 同上，雲端 D1 |
| `npm run db:setup` | `db:migrate` + `db:seed`（首次設定用這個） |
| `npm run db:reset` | 清空本機 D1 並重新建立（改了 migrations 後使用） |
| `npm run db:reset-admin` | 重設管理者 PIN／密碼（互動式，預設本機） |
| `npm run db:query -- "SELECT ..."` | 查詢本機 D1 |
| `npm run env:sync` | 將 `.env` 同步為 `.dev.vars`（`dev:worker` 會自動執行） |

### 為什麼不再直接用 `wrangler d1 execute`？

1. **路徑**：直接執行 `wrangler d1 execute --file=migrations/x.sql` 時，
   `--file` 相對於**當前工作目錄**，不在專案根目錄就會找不到檔案。
   `scripts/migrate.mjs` 以 `__dirname` 推導根目錄，杜絕此問題。
2. **冪等性**：`ALTER TABLE ... RENAME COLUMN` 重複執行會報錯。
   遷移執行器會在 D1 內建立 `schema_migrations` 資料表記錄已套用的檔案，只執行新的。
3. **多敘述**：D1 的 `--command` 只接受單一 SQL 敘述，分號分隔的語句不會全部執行。

---

## 檔案儲存（本機檔案，取代 R2）

### 為什麼要改？

Cloudflare Worker 的執行環境（workerd）**沒有檔案系統**。實測結果：

| 能力 | 結果 |
|---|---|
| `node:fs` 寫檔 | ✗ `[unenv] fs.writeFileSync is not implemented yet!` |
| `ASSETS.put()`（靜態資產） | ✗ `The RPC receiver does not implement the method "put"` |
| `ASSETS.fetch()`（讀取） | ✓ 唯讀 |
| R2 | ✓ |

因此要讓「檔案上傳到本機資料夾」真正運作，**後端必須在 Node.js 上執行**。

### 架構

```
┌─────────────────────────────────────────────────────┐
│ 本機開發 (npm run dev)                              │
│                                                     │
│  server/local.ts  (Node.js + @hono/node-server)     │
│    ├─ D1     → node:sqlite 直開 wrangler 的 SQLite  │
│    └─ 檔案   → node:fs 寫入 uploads/                │
└─────────────────────────────────────────────────────┘
                        ↕  同一份資料庫
        .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
                        ↕  同一套 migrations/
        npm run db:migrate  (wrangler d1 execute --local)
```

`server/d1-local.ts` 是一層 **D1Database 相容層**，用 Node 內建的 `node:sqlite`
包裝出 D1 的 API，因此 `src/routes/**` 完全不必修改即可在 Node 上執行。

### 兩種儲存實作

`src/storage/types.ts` 定義 `FileStorage` 介面，`createStorage(env)` 負責解析：

| 環境 | 實作 | 儲存位置 |
|---|---|---|
| Node 本機 | `LocalDiskStorage` | `uploads/<檔案鍵>` |
| Worker 部署 | `D1BlobStorage` | D1 `uploads` 資料表（base64 TEXT） |

> **為什麼 Worker 後備方案用 base64 而不是 BLOB？**
> D1 在將查詢結果序列化回應時，會把 BLOB 欄位轉成「逗號分隔的十進位數字字串」
> （例如 `"137,80,78,13,..."`），導致二進位內容失真（下載的檔案大小與內容都不對）。
> 改存 base64 字串可完整往返，且為純 ASCII 不受編碼影響。
> 對應遷移：`migrations/0004_uploads_base64.sql`。

兩者皆以 `key` 為索引，`products.image_key` 存放該鍵，
前端透過 `GET /uploads/:key` 取得檔案。

### 上傳流程

```
POST /products/products/upload  (multipart/form-data)
  → 驗證 MIME 與大小 (≤5MB)
  → 產生安全檔案鍵 <時間戳>_<亂數>_<原檔名>
  → 寫入 uploads/
  → UPDATE products SET image_key = ? WHERE id = ?
  → 回傳 { key, url: "/uploads/<key>" }
```

刪除商品或置換圖片時，實體檔案會一併刪除（不留孤兒檔案）。

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

權限唯一真實來源為 `permissions` 與 `role_permissions` 兩張資料表。

1. Boss 於 `/admin` →「角色權限」勾選哪些角色可用哪些功能。
2. 前端 `usePermissions()` 呼叫 `GET /admin/permissions/me` 取得自身權限清單。
3. `DiscountButtons` 僅渲染已授權的折扣按鈕（例：7 折僅店長以上出現）。
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
| GET | `/uploads/:key` | 檔案輸出 |

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

---

## 其他開發指令

| 指令 | 說明 |
|---|---|
| `npm run dev` | Node 本機伺服器（含熱重載） |
| `npm run dev:web` | Vite 前端開發伺服器 |
| `npm run dev:worker` | 以 wrangler/workerd 執行（檔案改用 D1 BLOB 儲存） |
| `npm run typecheck` | 檢查 Worker + Server 兩套型別 |
| `npm run build` | 型別檢查 + 前端建置 |

---

## 部署到 Cloudflare（Worker 同時提供前端與 API）

Worker 同時掛載 **靜態資產（前端 SPA）** 與 **API**，只需部署一次：

```
https://pos-api.<你的子網域>.workers.dev/          → 前端 POS 主畫面
https://pos-api.<你的子網域>.workers.dev/order     → 顧客線上點餐
https://pos-api.<你的子網域>.workers.dev/api/health → API 健康檢查
```

### 靜態資產與 SPA 路由

`wrangler.toml`：

```toml
[assets]
directory = "./frontend/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = true
```

| 設定 | 作用 |
|---|---|
| `directory` | 前端建置輸出目錄（`npm run build:frontend` 產生） |
| `binding = "ASSETS"` | 讓 Worker 透過 `env.ASSETS` 讀取靜態檔 |
| `not_found_handling` | 未匹配路徑以 `index.html` 回應（SPA fallback） |
| `run_worker_first = true` | 所有請求先進 Worker，由 `src/app.ts` 分流 API / 靜態檔 / index.html |

> wrangler 3.x 的 `run_worker_first` 僅支援 boolean；若升級到 wrangler 4.x，
> 可改為陣列形式（例：`run_worker_first = ["/api/*"]`）讓靜態檔直接由 Cloudflare 提供，
> 減少 Worker CPU 消耗。

`src/app.ts` 的 SPA fallback 邏輯：

```
請求 → API 路由？  → 是 → 回傳 JSON
       → 否 → env.ASSETS 有此路徑？ → 是 → 回傳靜態檔
                          → 否 → 回傳 index.html（前端路由接管）
```

### API 路徑前綴

前端固定使用 `/api/*`，避免與 SPA 路由衝突（`/admin` 同時是 API 前綴與頁面路徑）。
後端同時掛載 `/api/*` 與根路徑，兩者皆可用：

| 前綴 | 範例 |
|---|---|
| `/api/*`（前端使用） | `/api/orders`、`/api/admin/users`、`/api/menu/products` |
| 根路徑（方便測試） | `/orders`、`/admin/users`、`/menu/products` |

### 部署步驟

```bash
# 1. 登入（若尚未登入）
npx wrangler login

# 2. 確認 wrangler.toml 的 database_id 已填入實際值
#    （執行 npx wrangler d1 create pos-db 後取得）

# 3. 遷移 + 種子資料（雲端）
npm run db:migrate:remote
npm run db:seed:remote

# 4. 設定 JWT 密鑰
#    （JWT_SECRET 不可同時存在於 wrangler.toml [vars] 與 secret，否則會名稱衝突）
npx wrangler secret put JWT_SECRET

# 5. 建置前端並部署 Worker（前端與 API 一起上線）
npm run deploy
```

`npm run deploy` = 型別檢查 → 前端建置 → `wrangler deploy`（含 assets）。

### 本機開發的環境變數

`JWT_SECRET` 在本機使用 `.env`（已被 git 忽略）：

```bash
cp .env.example .env
```

`npm run dev`（Node 伺服器）直接讀取 `.env`；
`npm run dev:worker`（wrangler dev）會先自動同步成 `.dev.vars` 再啟動。

> 若要以 Pages 部署前端（與 Worker 分離），請另外設定
> `frontend/public/_redirects`（內容 `/*  /index.html  200`）並執行 `wrangler pages deploy`。
> 目前預設為 Worker 一體部署，前端與 API 同網域，不需要額外設定 CORS 或 API_BASE。

> Worker 環境沒有檔案系統，圖片會自動改存 D1 的 `uploads` 資料表 (BLOB)。
> 若需要大量圖片，建議重新啟用 R2（`createStorage()` 已預留該介面）。

---

## 已知待辦

- [x] 密碼與 PIN 改為 bcrypt 雜湊（bcryptjs，Worker 相容）
- [x] 管理者權限的環境隔離（本機完整 / 遠端鎖定）
- [x] 移除種子資料中的硬編碼明文 PIN，改由 `.env` 提供
- [ ] PIN 登入加入嘗試次數限制與鎖定
- [ ] 線上訂單即時推播（WebSocket Durable Object 或 Cloudflare Pub/Sub）
- [ ] 銷售分析報表頁面
- [ ] 訂單列印（thermal printer / ESC-POS）
