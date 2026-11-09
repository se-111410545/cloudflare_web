-- 種子資料：角色 / 權限 / 角色權限對應 / 分類 / 商品
--
-- ⚠️ 使用者的密碼與 PIN 不在此檔案內。
--    憑證必須經過 bcrypt 雜湊，因此由 scripts/seed.mjs 負責寫入，
--    讀取 .env 的 ADMIN_PIN 與各角色 *_PIN。
--
-- 執行方式：npm run db:seed （或 npm run db:seed:remote）

-- ============================================
-- 角色
-- ============================================
INSERT OR IGNORE INTO roles (id, role_name, hierarchy_level) VALUES
  (1, 'Boss', 4),
  (2, 'Store Manager', 3),
  (3, 'Supervisor', 2),
  (4, 'Staff', 1);

-- ============================================
-- 權限
-- ============================================
INSERT OR IGNORE INTO permissions (id, permission_key, name) VALUES
  (1,  'discount:none',   '無折扣'),
  (2,  'discount:5',      '95 折'),
  (3,  'discount:10',     '9 折'),
  (4,  'discount:15',     '85 折'),
  (5,  'discount:20',     '8 折'),
  (6,  'discount:30',     '7 折'),
  (7,  'discount:50',     '5 折'),
  (8,  'order:cancel',    '取消訂單 / 退款'),
  (9,  'order:refund',    '退款'),
  (10, 'product:manage',  '商品與分類管理'),
  (11, 'product:upload',  '商品圖片上傳'),
  (12, 'staff:manage',    '員工管理'),
  (13, 'permission:manage','角色權限設定'),
  (14, 'analytics:view',  '銷售數據分析');

-- ============================================
-- 角色權限對應
-- Boss 預設全部權限
-- ============================================
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
  SELECT 1, id FROM permissions;

-- 店長：折扣至 8 折、商品管理、圖片上傳、取消訂單、銷售分析
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  (2, 1), (2, 2), (2, 3), (2, 4), (2, 5),
  (2, 8), (2, 9), (2, 10), (2, 11), (2, 14);

-- 小主管：折扣至 85 折、取消訂單
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  (3, 1), (3, 2), (3, 3), (3, 4), (3, 8), (3, 9);

-- 一般員工：僅無折扣
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  (4, 1);

-- ============================================
-- 分類
-- ============================================
INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES
  (1, '咖啡', 1),
  (2, '茶飲', 2),
  (3, '輕食', 3),
  (4, '甜點', 4);

-- ============================================
-- 商品
-- ============================================
INSERT OR IGNORE INTO products (category_id, name, price, is_available) VALUES
  (1, '美式咖啡',   120, 1),
  (1, '拿鐵咖啡',   150, 1),
  (1, '卡布奇諾',   160, 1),
  (1, '濃縮咖啡',   100, 1),
  (2, '台灣珍珠奶茶', 130, 1),
  (2, '綠茶拿鐵',   140, 1),
  (2, '鮮榨橙汁',   160, 1),
  (2, '冰紅茶',     110, 1),
  (3, '火腿三明治', 180, 1),
  (3, '雞肉沙拉',   190, 1),
  (3, '炸薯條',     120, 1),
  (3, '洋芋片',     90,  1),
  (4, '提拉米蘇',   210, 1),
  (4, '巧克力蛋糕', 200, 1),
  (4, '可麗餅',     170, 1),
  (4, '冰淇淋',     130, 1);
