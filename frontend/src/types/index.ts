export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface Product {
  id: number;
  category_id: number;
  category_name?: string | null;
  name: string;
  price: number;
  /** 檔案鍵，實體檔案存放於 uploads/ 資料夾 */
  image_key?: string | null;
  is_available: number | boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'pending' | 'preparing' | 'completed' | 'cancelled';
export type OrderType = 'dine_in' | 'takeaway';

export interface Order {
  id: number;
  order_number: string;
  type: OrderType;
  status: OrderStatus;
  total_amount: number;
  discount_amount: number;
  table_number?: string | null;
  created_at: string;
  cashier_name?: string | null;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface Role {
  id: number;
  role_name: string;
  hierarchy_level: number;
}

export interface Permission {
  id: number;
  permission_key: string;
  name: string;
}

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  pin_code?: string | null;
  role_id: number;
  role_name?: string;
  hierarchy_level?: number;
}
