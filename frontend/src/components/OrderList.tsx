import { Clock, Table2, ShoppingBag, User } from 'lucide-react';
import { Order, OrderStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待處理',
  preparing: '製作中',
  completed: '已完成',
  cancelled: '已取消',
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: 'badge-pending',
  preparing: 'badge-preparing',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
};

interface OrderListProps {
  orders: Order[];
  onUpdateStatus?: (orderId: number, status: OrderStatus) => void;
  /** 僅小主管以上可見的取消/退款按鈕 */
  canCancel?: boolean;
  compact?: boolean;
}

export function OrderList({ orders, onUpdateStatus, canCancel = false, compact = false }: OrderListProps) {
  if (orders.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">目前沒有訂單</p>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((order) => (
        <li
          key={order.id}
          className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                <ShoppingBag className="h-3.5 w-3.5 text-gray-400" />
                {order.order_number}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(order.created_at).toLocaleTimeString('zh-TW', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>{order.type === 'dine_in' ? '內用' : '外帶'}</span>
                {order.table_number && (
                  <span className="inline-flex items-center gap-1">
                    <Table2 className="h-3 w-3" />
                    {order.table_number}
                  </span>
                )}
                {order.cashier_name && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {order.cashier_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={cn(STATUS_CLASS[order.status])}>
                {STATUS_LABEL[order.status]}
              </span>
              <span className="text-sm font-bold text-pos-700">
                ${Number(order.total_amount).toFixed(0)}
              </span>
            </div>
          </div>

          {onUpdateStatus && !compact && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
              {order.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(order.id, 'preparing')}
                  className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  開始製作
                </button>
              )}
              {order.status === 'preparing' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(order.id, 'completed')}
                  className="rounded bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                >
                  完成
                </button>
              )}
              {canCancel && order.status !== 'cancelled' && order.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(order.id, 'cancelled')}
                  className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  取消/退款
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
