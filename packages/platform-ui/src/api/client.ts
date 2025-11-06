// Centralized API client utilities
// - getApiBase(): resolve API base URL from config
// - buildUrl(path, base?): join base with normalized path
// - httpJson<T>(path, init?, base?): fetch JSON with sane defaults
// Minimal API base resolver for client utilities
export function getApiBase(override?: string): string {
  if (override) return override;
  const viteBase = (import.meta as { env?: Record<string, unknown> } | undefined)?.env?.VITE_API_BASE_URL;
  if (typeof viteBase === 'string' && viteBase) return viteBase;
  const nodeBase = (typeof process !== 'undefined' ? process.env?.API_BASE_URL : undefined);
  if (typeof nodeBase === 'string' && nodeBase) return nodeBase;
  throw new Error('API base not configured. Set VITE_API_BASE_URL.');
}

export function buildUrl(path: string, base?: string): string {
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
