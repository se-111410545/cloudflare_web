import { Minus, Plus, ShoppingCart, Trash2, CreditCard, Banknote, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DiscountButtons, DiscountOption } from '@/components/DiscountButtons';
import { CartItem, OrderType } from '@/types';
import { cn } from '@/lib/utils';

interface CartPanelProps {
  items: CartItem[];
  onQuantityChange: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onClear: () => void;
  orderType: OrderType;
  onOrderTypeChange: (type: OrderType) => void;
  tableNumber: string;
  onTableNumberChange: (v: string) => void;
  discount: DiscountOption | null;
  onDiscountChange: (d: DiscountOption) => void;
  onCheckout: (payment: 'cash' | 'card') => void;
  processing?: boolean;
}

export function CartPanel({
  items,
  onQuantityChange,
  onRemove,
  onClear,
  orderType,
  onOrderTypeChange,
  tableNumber,
  onTableNumberChange,
  discount,
  onDiscountChange,
  onCheckout,
  processing = false,
}: CartPanelProps) {
  const [paymentMode, setPaymentMode] = useState<'cash' | 'card'>('cash');
  const [cardResult, setCardResult] = useState<'success' | 'failure' | null>(null);

  const subtotal = items.reduce((sum, i) => sum + Number(i.product.price) * i.quantity, 0);
  const rate = discount?.rate ?? 1;
  const discountAmount = subtotal * (1 - rate);
  const total = Math.max(0, subtotal - discountAmount);

  const handleCardPay = async () => {
    setCardResult(null);
    setPaymentMode('card');
    // 模擬信用卡付款：隨機成功/失敗
    const success = Math.random() > 0.3;
    setCardResult(success ? 'success' : 'failure');
    if (success) {
      onCheckout('card');
    }
  };

  return (
    <aside className="flex h-full w-full flex-col border-l border-gray-200 bg-white lg:w-96">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-800">
          <ShoppingCart className="h-5 w-5 text-pos-600" />
          購物車
          {items.length > 0 && (
            <span className="rounded-full bg-pos-600 px-2 py-0.5 text-xs text-white">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-gray-400 hover:text-red-500"
          >
            清除
          </button>
        )}
      </div>

      {/* 內用/外帶 */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex gap-2">
          {(
            [
              { key: 'dine_in' as const, label: '內用' },
              { key: 'takeaway' as const, label: '外帶' },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onOrderTypeChange(t.key)}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
                orderType === t.key
                  ? 'bg-pos-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {orderType === 'dine_in' && (
          <input
            value={tableNumber}
            onChange={(e) => onTableNumberChange(e.target.value)}
            placeholder="桌號 (例如 A1)"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-pos-500 focus:ring-2 focus:ring-pos-500/20"
          />
        )}
      </div>

      {/* 折扣按鈕 (依角色權限動態顯示) */}
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          折扣
        </p>
        <DiscountButtons value={discount} onChange={onDiscountChange} />
      </div>

      {/* 商品明細 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-300">
            <ShoppingCart className="mb-2 h-12 w-12" />
            <p className="text-sm">尚未加入商品</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map(({ product, quantity }) => (
              <li
                key={product.id}
                className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">{product.name}</p>
                  <p className="text-xs text-gray-500">
                    ${Number(product.price).toFixed(0)} × {quantity}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onQuantityChange(product.id, -1)}
                    className="rounded p-1 text-gray-500 hover:bg-white hover:text-pos-700"
                  >
                    {quantity === 1 ? (
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Minus className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => onQuantityChange(product.id, 1)}
                    className="rounded p-1 text-gray-500 hover:bg-white hover:text-pos-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="w-14 text-right text-sm font-bold text-gray-800">
                  ${(Number(product.price) * quantity).toFixed(0)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 金額與結帳 */}
      <div className="border-t border-gray-200 px-4 py-3">
        <dl className="mb-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">小計</dt>
            <dd className="font-semibold">${subtotal.toFixed(0)}</dd>
          </div>
          {discount && discount.rate < 1 && (
            <div className="flex justify-between text-red-500">
              <dt className="flex items-center gap-1">
                折扣 ({discount.label})
              </dt>
              <dd className="font-semibold">-${discountAmount.toFixed(0)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-100 pt-2 text-base">
            <dt className="font-bold">總計</dt>
            <dd className="font-bold text-pos-700">${total.toFixed(0)}</dd>
          </div>
        </dl>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMode('cash')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors',
              paymentMode === 'cash'
                ? 'border-pos-600 bg-pos-50 text-pos-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            )}
          >
            <Banknote className="h-4 w-4" /> 現金
          </button>
          <button
            type="button"
            onClick={handleCardPay}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors',
              paymentMode === 'card'
                ? 'border-pos-600 bg-pos-50 text-pos-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            )}
          >
            <CreditCard className="h-4 w-4" /> 測試信用卡
          </button>
        </div>

        {cardResult === 'failure' && (
          <p className="mb-2 flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">
            <XCircle className="h-3.5 w-3.5" /> 信用卡付款失敗，請重試或改用現金
          </p>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={items.length === 0 || processing}
          onClick={() => onCheckout(paymentMode)}
        >
          {processing ? '送出中…' : `結帳 $${total.toFixed(0)}`}
        </Button>
      </div>
    </aside>
  );
}
