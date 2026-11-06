const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem('pos_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    window.location.href = '/login';
  }

  return res;
}

export async function apiJson<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await apiRequest(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: (path: string) => apiJson(path),
  post: (path: string, body?: any) =>
    apiJson(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: any) =>
    apiJson(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: any) =>
    apiJson(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: (path: string, body?: any) =>
    apiJson(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  postForm: async (path: string, formData: FormData) => {
    const token = localStorage.getItem('pos_token');
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};

/**
 * 產生圖片 URL
 *
 * 檔案由後端的 /uploads/:key 端點輸出（實體檔案存放於本機 uploads/ 資料夾）。
 */
export function imageUrl(key?: string | null): string | undefined {
  if (!key) return undefined;
  return `${API_BASE}/uploads/${encodeURIComponent(key)}`;
}