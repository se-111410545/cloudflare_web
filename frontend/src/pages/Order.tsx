import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Coffee,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
} from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Category, OrderType, Product } from '@/types';
import { cn } from '@/lib/utils';

interface CartLine {
  product: Product;
  quantity: number;
}

export default function Order() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [tableNumber, setTableNumber] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // 線上下單無需登入，故以公開端點載入商品
    Promise.all([api.get('/menu/products'), api.get('/menu/categories')])
      .then(([p, c]) => {
        setProducts(p.products ?? []);
        setCategories(c.categories ?? []);
      })
      .catch(() => setError('載入菜單失敗，請稍後再試'));
  }, []);

  const available = useMemo(
    () => products.filter((p) => p.is_available),
    [products]
  );

  const filtered = useMemo(
    () =>
      available.filter(
        (p) => activeCategory === 'all' || p.category_id === activeCategory
      ),
    [available, activeCategory]
  );

  const subtotal = cart.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0);
  const totalCount = cart.reduce((s, i) => s + i.quantity, 0);

  const add = (product: Product) => {
    setCart((prev) => {
      const found = prev.find((i) => i.product.id === product.id);
      if (found) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const submitOrder = async () => {
    if (cart.length === 0) return;
    if (orderType === 'dine_in' && !tableNumber.trim()) {
      setError('請輸入桌號');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = await api.post('/menu/orders', {
        type: orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber.trim() : null,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: Number(i.product.price),
        })),
        discountAmount: 0,
      });
      setSuccess(`訂單 ${data.order.order_number} 已送出！請到櫃檯取餐`);
      setCart([]);
      setTableNumber('');
      setCartOpen(false);
      setTimeout(() => setSuccess(null), 6000);
    } catch (err: any) {
      setError(err.message || '訂單送出失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 頂部 */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-pos-900 to-pos-600 px-4 py-4 text-white">
        <div className="flex items-center gap-2">
          <Coffee className="h-6 w-6" />
          <div>
            <h1 className="text-lg font-bold">線上點餐</h1>
            <p className="text-xs text-white/80">掃碼點餐 · 免費外送服務</p>
          </div>
        </div>
      </header>

      {success && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          <Check className="h-5 w-5" />
          {success}
        </div>
      )}
      {error && (
        <div className="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* 內用 / 外帶 */}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
        {(
          [
            { key: 'dine_in' as const, label: '內用', icon: <Store className="h-4 w-4" /> },
            { key: 'takeaway' as const, label: '外帶', icon: <ShoppingBag className="h-4 w-4" /> },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOrderType(t.key)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold shadow-sm transition-colors',
              orderType === t.key
                ? 'bg-pos-600 text-white'
                : 'bg-white text-gray-600'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {orderType === 'dine_in' && (
        <div className="mx-4 mt-3">
          <input
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="請輸入桌號"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pos-500 focus:ring-2 focus:ring-pos-500/20"
          />
        </div>
      )}

      {/* 分類 */}
      <div className="sticky top-[68px] z-10 mt-4 flex gap-2 overflow-x-auto bg-gray-50 px-4 py-2">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={cn(
            'whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
            activeCategory === 'all' ? 'bg-pos-600 text-white' : 'bg-white text-gray-600'
          )}
        >
          全部
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCategory(c.id)}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
              activeCategory === c.id ? 'bg-pos-600 text-white' : 'bg-white text-gray-600'
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* 商品列表 */}
      <div className="mx-4 mt-2 space-y-2 pb-4">
        {filtered.map((p) => {
          const line = cart.find((i) => i.product.id === p.id);
          const img = imageUrl(p.image_key);
          return (
            <div key={p.id} className="card-pos flex items-center gap-3 p-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {img ? (
                  <img src={img} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <Coffee className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-800">{p.name}</p>
                <p className="text-sm font-semibold text-pos-700">
                  ${Number(p.price).toFixed(0)}
                </p>
              </div>
              {line ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeQty(p.id, -1)}
                    className="rounded-full border border-gray-300 p-1.5 text-gray-600 active:bg-gray-100"
                  >
                    {line.quantity === 1 ? (
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Minus className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="w-5 text-center text-sm font-bold">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    className="rounded-full border border-pos-600 bg-pos-600 p-1.5 text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => add(p)}
                  className="rounded-full border border-pos-600 bg-white p-1.5 text-pos-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">目前沒有可點的商品</p>
        )}
      </div>

      {/* 底部購物車列 */}
      {totalCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              type="button"
              onClick={() => setCartOpen((v) => !v)}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pos-600 text-white"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold">
                {totalCount}
              </span>
            </button>
            <div className="flex-1">
              <p className="text-lg font-bold text-pos-700">${subtotal.toFixed(0)}</p>
              <p className="text-xs text-gray-500">
                {cartOpen ? '點擊收起' : '點擊查看購物車'}
              </p>
            </div>
            <Button size="lg" className="px-6" onClick={submitOrder} disabled={submitting}>
              {submitting ? '送出中…' : '送出訂單'}
            </Button>
          </div>
        </div>
      )}

      {/* 購物車抽屜 */}
      {cartOpen && totalCount > 0 && (
        <div className="fixed inset-0 z-40 flex items-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCartOpen(false)}
          />
          <div className="relative max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">我的購物車</h2>
              <button type="button" onClick={() => setCartOpen(false)}>
                <ChevronDown className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <ul className="space-y-2">
              {cart.map(({ product, quantity }) => (
                <li
                  key={product.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      ${Number(product.price).toFixed(0)} × {quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => changeQty(product.id, -1)}
                      className="rounded-full border border-gray-300 p-1.5"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => add(product)}
                      className="rounded-full border border-pos-600 bg-pos-600 p-1.5 text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="w-14 text-right text-sm font-bold">
                    ${(Number(product.price) * quantity).toFixed(0)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm font-semibold text-gray-600">總計</span>
              <span className="text-lg font-bold text-pos-700">${subtotal.toFixed(0)}</span>
            </div>
            <Button
              className="mt-3 w-full"
              size="lg"
              onClick={submitOrder}
              disabled={submitting}
            >
              {submitting ? '送出中…' : '送出訂單'}
            </Button>
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="mt-2 flex w-full items-center justify-center gap-1 py-1 text-xs text-gray-400"
            >
              <ChevronUp className="h-3 w-3" />
              繼續瀏覽
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
