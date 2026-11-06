-- ============================================
-- 資料完整性修正
--
-- 1. 清除重複商品（種子資料重複執行所造成，保留最早建立者）
-- 2. 建立唯一索引，避免同分類同名商品重複產生
--    （讓 seeds/001_demo_data.sql 的 INSERT OR IGNORE 真正生效）
-- ============================================

-- 先清除指向即將被刪除商品的訂單明細
DELETE FROM order_items
WHERE product_id IN (
  SELECT id FROM products
  WHERE id NOT IN (
    SELECT MIN(id) FROM products GROUP BY category_id, name
  )
);

-- 刪除重複商品
DELETE FROM products
WHERE id NOT IN (
  SELECT MIN(id) FROM products GROUP BY category_id, name
);

-- 同分類下商品名稱唯一
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_category_name
  ON products(category_id, name);
