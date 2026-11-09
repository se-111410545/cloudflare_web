import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleId: number;
  hierarchyLevel: number;
  hasPin?: boolean;
  /**
   * 管理權限範圍
   *   full      → 完整管理能力（本機，或已設定 ALLOW_REMOTE_ADMIN=true）
   *   restricted → 遠端鎖定：禁止增刪資料與變更權限，後端亦會拒絕
   */
  adminScope: 'full' | 'restricted';
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  hasPermission: (permissionKey: string) => boolean;
  /** 目前環境是否禁止高風險管理寫入 */
  adminRestricted: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    const storedUser = localStorage.getItem('pos_user');
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  const login = (token: string, userData: AuthUser) => {
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    setUser(null);
    window.location.href = '/login';
  };

  // 檢查角色權限（前端快取：實際權限仍以後端 role_permissions 為準）
  const hasPermission = (permissionKey: string): boolean => {
    if (!user) return false;
    if (user.role === 'Boss') return true;
    const level = user.hierarchyLevel;
    if (permissionKey === 'discount:30' || permissionKey === 'discount:50') {
      return level >= 3; // 店長以上
    }
    if (permissionKey === 'order:cancel' || permissionKey === 'order:refund') {
      return level >= 2; // 小主管以上
    }
    return true;
  };

  const adminRestricted = user?.adminScope === 'restricted';

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, hasPermission, adminRestricted }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
