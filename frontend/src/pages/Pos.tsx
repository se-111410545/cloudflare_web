import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Settings,
  X,
} from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ProductGrid } from '@/components/ProductGrid';
import { CartPanel } from '@/components/CartPanel';
import { OrderList } from '@/components/OrderList';
import { DiscountOption } from '@/components/DiscountButtons';
import { Button } from '@/components/ui/button';
import { CartItem, Category, Order, OrderStatus, OrderType, Product } from '@/types';
import { cn } from '@/lib/utils';

export default function Pos() {
  const { user, logout } = useAuth();
  const { has } = usePermissions();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [discount, setDiscount] = useState<DiscountOption | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showOrders, setShowOrders] = useState(true);

  const canManage = user?.role === 'Boss' || user?.role === 'Store Manager';
  const canCancel = has('order:cancel') || has('order:refund');

  const loadProducts = useCallback(async () => {
    const [p, c] = await Promise.all([
      api.get('/products/products'),
      api.get('/products/categories'),
    ]);
    setProducts(p.products ?? []);
    setCategories(c.categories ?? []);
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.get('/orders?limit=30');
      setOrders(data.orders ?? []);
    } catch {
      /* 忽略輪詢錯誤 */
    }
  }, []);

  useEffect(() => {
    loadProducts().catch(() => setMessage({ type: 'err', text: '載入商品失敗' }));
    loadOrders();
    // 輪詢訂單以模擬即時通知
    const timer = setInterval(loadOrders, 8000);
    return () => clearInterval(timer);
  }, [loadProducts, loadOrders]);

  const handleSelectProduct = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleQuantityChange = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const handleRemove = (productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const subtotal = useMemo(
    () => cart.reduce((sum, i) => sum + Number(i.product.price) * i.quantity, 0),
    [cart]
  );

  const handleCheckout = async (payment: 'cash' | 'card') => {
    if (cart.length === 0) return;
    setProcessing(true);
    setMessage(null);
    try {
      const discountAmount = discount ? subtotal * (1 - discount.rate) : 0;
      const data = await api.post('/orders', {
        type: orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber : null,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: Number(i.product.price),
        })),
        discountAmount,
      });
      setMessage({
        type: 'ok',
        text: `訂單 ${data.order.order_number} 建立成功（${payment === 'cash' ? '現金' : '信用卡'}）`,
      });
      setCart([]);
      setDiscount(null);
      setTableNumber('');
      await loadOrders();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || '結帳失敗' });
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateStatus = async (orderId: number, status: OrderStatus) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      await loadOrders();
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || '更新失敗' });
    }
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* 頂部列 */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-pos-600" />
          <div>
            <h1 className="text-base font-bold text-gray-800">POS 系統</h1>
            <p className="text-xs text-gray-500">
              {user?.name} · {user?.role}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOrders((v) => !v)}
            className="lg:hidden"
          >
            <Bell className="mr-1.5 h-4 w-4" />
            訂單
          </Button>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
              <Settings className="mr-1.5 h-4 w-4" />
              管理
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="mr-1.5 h-4 w-4" />
            登出
          </Button>
        </div>
      </header>

      {/* 訊息列 */}
      {message && (
        <div
          className={cn(
            'flex items-center justify-between px-4 py-2 text-sm font-medium',
            message.type === 'ok'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          )}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 即時訂單 */}
        <aside
          className={cn(
            'w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-100 p-3',
            showOrders ? 'block' : 'hidden lg:block'
          )}
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700">
            <ClipboardList className="h-4 w-4 text-pos-600" />
            即時訂單
          </h2>
          <OrderList
            orders={orders}
            onUpdateStatus={handleUpdateStatus}
            canCancel={canCancel}
          />
        </aside>

        {/* 商品區 */}
        <main className="flex-1 overflow-hidden p-4">
          <ProductGrid
            products={products}
            categories={categories}
            onSelect={handleSelectProduct}
            imageUrl={imageUrl}
          />
        </main>

        {/* 購物車 */}
        <CartPanel
          items={cart}
          onQuantityChange={handleQuantityChange}
          onRemove={handleRemove}
          onClear={() => {
            setCart([]);
            setDiscount(null);
          }}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
          tableNumber={tableNumber}
          onTableNumberChange={setTableNumber}
          discount={discount}
          onDiscountChange={setDiscount}
          onCheckout={handleCheckout}
          processing={processing}
        />
      </div>
    </div>
  );
}
