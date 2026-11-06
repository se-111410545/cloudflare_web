import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * 取得目前登入者角色所擁有的權限清單。
 * 後端 role_permissions 為單一真實來源，
 * Boss 在後台調整設定後，前端按鈕即時反映。
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/admin/permissions/me');
      setPermissions(data.permissions ?? []);
    } catch {
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const has = useCallback(
    (permissionKey: string) => permissions.includes(permissionKey),
    [permissions]
  );

  return { permissions, loading, has, refresh };
}
