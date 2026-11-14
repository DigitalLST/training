export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
export class ApiError extends Error {
  status: number; code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code;
  }
}
export async function api(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || data?.message || `HTTP ${res.status}`, res.status, data?.code);
  return data;
}
