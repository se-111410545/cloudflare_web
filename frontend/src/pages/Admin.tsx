import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ImagePlus,
  LayoutGrid,
  Plus,
  Trash2,
  Upload,
  Users,
  FolderTree,
  ShieldCheck,
} from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Category, Permission, Product, Role, StaffUser } from '@/types';
import { cn } from '@/lib/utils';

type TabKey = 'products' | 'categories' | 'staff' | 'permissions';

export default function Admin() {
  const { user, adminRestricted } = useAuth();
  const navigate = useNavigate();
  const isBoss = user?.role === 'Boss' && !adminRestricted;

  const [tab, setTab] = useState<TabKey>('products');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // 商品 / 分類
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    categoryId: '',
  });

  // 員工
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    pinCode: '',
    roleId: '',
  });

  // 權限矩陣
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<{
    role_id: number;
    permission_id: number;
  }[]>([]);

  const loadCatalog = useCallback(async () => {
    const [p, c] = await Promise.all([
      api.get('/products/products'),
      api.get('/products/categories'),
    ]);
    setProducts(p.products ?? []);
    setCategories(c.categories ?? []);
  }, []);

  const loadStaff = useCallback(async () => {
    const [u, r] = await Promise.all([api.get('/admin/users'), api.get('/admin/roles')]);
    setStaff(u.users ?? []);
    setRoles(r.roles ?? []);
  }, []);

  const loadPermissions = useCallback(async () => {
    const [p, rp] = await Promise.all([
      api.get('/admin/permissions'),
      api.get('/admin/role-permissions'),
    ]);
    setPermissions(p.permissions ?? []);
    setRolePermissions(rp.rolePermissions ?? []);
  }, []);

  useEffect(() => {
    loadCatalog().catch(() => setError('載入商品失敗'));
    if (isBoss) {
      loadStaff().catch(() => setError('載入員工失敗'));
      loadPermissions().catch(() => setError('載入權限失敗'));
    }
  }, [isBoss, loadCatalog, loadStaff, loadPermissions]);

  const notify = (msg: string, isError = false) => {
    if (isError) setError(msg);
    else {
      setOk(msg);
      setError('');
    }
    setTimeout(() => {
      setOk('');
      setError('');
    }, 3000);
  };

  // ---------------------------------------------------------
  // 商品
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/products/products', {
        name: productForm.name,
        price: Number(productForm.price),
        categoryId: Number(productForm.categoryId),
        isAvailable: true,
      });
      setProductForm({ name: '', price: '', categoryId: '' });
      await loadCatalog();
      notify('商品已新增');
    } catch (err: any) {
      notify(err.message || '新增失敗', true);
    }
  };

  const handleToggleAvailable = async (product: Product) => {
    await api.put(`/products/products/${product.id}`, {
      isAvailable: !product.is_available,
    });
    await loadCatalog();
  };

  const handleUploadImage = async (productId: number, file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('productId', String(productId));
      await api.postForm('/products/products/upload', fd);
      await loadCatalog();
      notify('圖片已上傳至本機 uploads/');
    } catch (err: any) {
      notify(err.message || '上傳失敗', true);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('確定要刪除此商品？')) return;
    await api.del(`/products/products/${id}`);
    await loadCatalog();
    notify('商品已刪除');
  };

  // ---------------------------------------------------------
  // 分類
  const [categoryName, setCategoryName] = useState('');
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/products/categories', { name: categoryName });
      setCategoryName('');
      await loadCatalog();
      notify('分類已新增');
    } catch (err: any) {
      notify(err.message || '新增失敗', true);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('確定要刪除此分類？')) return;
    await api.del(`/products/categories/${id}`);
    await loadCatalog();
  };

  // ---------------------------------------------------------
  // 員工
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', {
        name: staffForm.name,
        email: staffForm.email,
        password: staffForm.password,
        pinCode: staffForm.pinCode || null,
        roleId: Number(staffForm.roleId),
      });
      setStaffForm({ name: '', email: '', password: '', pinCode: '', roleId: '' });
      await loadStaff();
      notify('員工已新增');
    } catch (err: any) {
      notify(err.message || '新增失敗', true);
    }
  };

  const handleDeleteStaff = async (id: number) => {
    if (!confirm('確定要刪除此員工？')) return;
    await api.del(`/admin/users/${id}`);
    await loadStaff();
  };

  // ---------------------------------------------------------
  // 權限矩陣
  const hasRolePermission = (roleId: number, permissionId: number) =>
    rolePermissions.some(
      (rp) => rp.role_id === roleId && rp.permission_id === permissionId
    );

  const togglePermission = async (roleId: number, permissionId: number) => {
    try {
      if (hasRolePermission(roleId, permissionId)) {
        await api.del('/admin/role-permissions', { roleId, permissionId });
      } else {
        await api.post('/admin/role-permissions', { roleId, permissionId });
      }
      await loadPermissions();
    } catch (err: any) {
      notify(err.message || '更新失敗', true);
    }
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; bossOnly?: boolean }[] = [
    { key: 'products', label: '商品管理', icon: <LayoutGrid className="h-4 w-4" /> },
    { key: 'categories', label: '分類管理', icon: <FolderTree className="h-4 w-4" /> },
    { key: 'staff', label: '員工管理', icon: <Users className="h-4 w-4" />, bossOnly: true },
    {
      key: 'permissions',
      label: '角色權限',
      icon: <ShieldCheck className="h-4 w-4" />,
      bossOnly: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/pos')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回 POS
          </Button>
          <h1 className="text-lg font-bold text-gray-800">後台管理</h1>
        </div>
        <span className="text-sm text-gray-500">
          {user?.name} · {user?.role}
        </span>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-4">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs
            .filter((t) => !t.bossOnly || isBoss)
            .map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
                  tab === t.key
                    ? 'border-pos-600 text-pos-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
        </nav>
      </div>

      <div className="p-4">
        {adminRestricted && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-bold text-amber-800">遠端管理寫入已封鎖</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              目前為線上部署環境，預設封鎖高風險操作（新增/修改/刪除員工與權限、商品與分類、檔案、刪除訂單），
              最高管理者權限已降級為店長。下單與結帳功能不受影響。
              <br />
              若確實需要開啟，請設定{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">
                ALLOW_REMOTE_ADMIN=true
              </code>{' '}
              後重新部署，或改由本機管理。
            </p>
          </div>
        )}

        {ok && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* -------------------------------------------------- 商品 */}
        {tab === 'products' && (
          <div className="space-y-4">
            <form onSubmit={handleAddProduct} className="card-pos p-4">
              <h2 className="mb-3 text-sm font-bold text-gray-700">新增商品</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label>商品名稱</Label>
                  <Input
                    value={productForm.name}
                    onChange={(e) =>
                      setProductForm({ ...productForm, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>價格</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={productForm.price}
                    onChange={(e) =>
                      setProductForm({ ...productForm, price: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>分類</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={productForm.categoryId}
                    onChange={(e) =>
                      setProductForm({ ...productForm, categoryId: e.target.value })
                    }
                    required
                  >
                    <option value="">請選擇</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full" disabled={adminRestricted}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    新增
                  </Button>
                </div>
              </div>
            </form>

            <div className="card-pos overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">圖片</th>
                    <th className="px-4 py-2">名稱</th>
                    <th className="px-4 py-2">分類</th>
                    <th className="px-4 py-2">價格</th>
                    <th className="px-4 py-2">上架</th>
                    <th className="px-4 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2">
                        <label className="relative block h-12 w-12 cursor-pointer overflow-hidden rounded border border-gray-200 bg-gray-50">
                          {p.image_key ? (
                            <img
                              src={imageUrl(p.image_key)}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-gray-300">
                              <ImagePlus className="h-5 w-5" />
                            </span>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                            disabled={adminRestricted}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadImage(p.id, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </td>
                      <td className="px-4 py-2 font-semibold">{p.name}</td>
                      <td className="px-4 py-2 text-gray-600">{p.category_name ?? '-'}</td>
                      <td className="px-4 py-2 font-bold text-pos-700">
                        ${Number(p.price).toFixed(0)}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailable(p)}
                          disabled={adminRestricted}
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs font-semibold',
                            p.is_available
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          )}
                        >
                          {p.is_available ? '販售中' : '停售'}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(p.id)}
                          disabled={adminRestricted}
                          className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* -------------------------------------------------- 分類 */}
        {tab === 'categories' && (
          <div className="space-y-4">
            <form onSubmit={handleAddCategory} className="card-pos flex items-end gap-3 p-4">
              <div className="flex-1 space-y-1">
                <Label>分類名稱</Label>
                <Input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={adminRestricted}>
                <Plus className="mr-1.5 h-4 w-4" />
                新增
              </Button>
            </form>

            <div className="card-pos divide-y divide-gray-100">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold text-gray-700">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(c.id)}
                      disabled={adminRestricted}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* -------------------------------------------------- 員工 */}
        {tab === 'staff' && isBoss && (
          <div className="space-y-4">
            <form onSubmit={handleAddStaff} className="card-pos p-4">
              <h2 className="mb-3 text-sm font-bold text-gray-700">新增員工</h2>
              <div className="grid gap-3 md:grid-cols-5">
                <div className="space-y-1">
                  <Label>姓名</Label>
                  <Input
                    value={staffForm.name}
                    onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={staffForm.email}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>密碼</Label>
                  <Input
                    type="password"
                    value={staffForm.password}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, password: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>PIN (4碼)</Label>
                  <Input
                    maxLength={4}
                    value={staffForm.pinCode}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, pinCode: e.target.value.replace(/\D/g, '') })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>角色</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={staffForm.roleId}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, roleId: e.target.value })
                    }
                    required
                  >
                    <option value="">請選擇</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.role_name} (L{r.hierarchy_level})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit" className="mt-3" disabled={adminRestricted}>
                <Plus className="mr-1.5 h-4 w-4" />
                新增員工
              </Button>
            </form>

            <div className="card-pos overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">姓名</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">PIN</th>
                    <th className="px-4 py-2">角色</th>
                    <th className="px-4 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2 font-semibold">{s.name}</td>
                      <td className="px-4 py-2 text-gray-600">{s.email}</td>
                      <td className="px-4 py-2 font-mono text-gray-600">
                        {s.pin_code ?? '-'}
                      </td>
                      <td className="px-4 py-2">{s.role_name}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteStaff(s.id)}
                          disabled={adminRestricted}
                          className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* -------------------------------------------------- 權限矩陣 */}
        {tab === 'permissions' && isBoss && (
          <div className="card-pos overflow-x-auto p-4">
            <h2 className="mb-1 text-sm font-bold text-gray-700">
              動態權限設定
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              勾選決定各角色可以使用哪些功能按鈕（例如 7 折按鈕僅限店長以上）。
              設定會立即反映於 POS 與線上下單畫面。
            </p>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">權限</th>
                  {roles.map((r) => (
                    <th key={r.id} className="px-3 py-2 text-center">
                      {r.role_name}
                      <span className="block text-[10px] font-normal text-gray-400">
                        L{r.hierarchy_level}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm) => (
                  <tr key={perm.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2">
                      <span className="block font-semibold text-gray-700">{perm.name}</span>
                      <span className="block font-mono text-[11px] text-gray-400">
                        {perm.permission_key}
                      </span>
                    </td>
                    {roles.map((r) => {
                      const checked = hasRolePermission(r.id, perm.id);
                      return (
                        <td key={r.id} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(r.id, perm.id)}
                            disabled={adminRestricted}
                            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-pos-600 focus:ring-pos-500"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
