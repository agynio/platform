// Centralized API client utilities
// - getApiBase(): resolve API base URL from config
// - buildUrl(path, base?): join base with normalized path
// - httpJson<T>(path, init?, base?): fetch JSON with sane defaults
import { config } from '@/config';

// Minimal API base resolver for client utilities
export function getApiBase(override?: string): string {
  // Optional override via argument; otherwise use resolved config
  if (override) return override;
  const base = config?.apiBaseUrl;
  if (typeof base === 'string') return base;
  throw new Error('API base not configured. Set VITE_API_BASE_URL.');
}

export function buildUrl(path: string, base?: string): string {
  // Optional override via `base`; otherwise use resolved config
  const b = typeof base === 'string' ? base : getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  // If base override is an empty string, return relative path for tests
  // Avoid double slashes
  return b.endsWith('/') ? `${b.slice(0, -1)}${p}` : `${b}${p}`;
}

// Returns parsed JSON or undefined (e.g., for 204 or non-JSON bodies)
export async function httpJson<T = unknown>(path: string, init?: RequestInit, base?: string): Promise<T | undefined> {
  const url = buildUrl(path, base);
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}
