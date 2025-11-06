// Centralized API client utilities
// - getApiBase(override?): resolve API base URL
// - buildUrl(path, base?): join base with normalized path
// - httpJson<T>(path, init?, base?): fetch JSON with sane defaults

// No direct dependency on app config to keep tests stable
function readViteEnv(): Record<string, string | undefined> | undefined {
  try {
    const fromGlobal = (globalThis as Record<string, unknown> | undefined)?.importMeta;
    const im = (typeof import.meta !== 'undefined' ? import.meta : undefined) ?? fromGlobal;
    if (im && typeof im === 'object' && 'env' in (im as Record<string, unknown>)) {
      const env = (im as { env?: unknown }).env;
      if (env && typeof env === 'object') return env as Record<string, string | undefined>;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function readNodeEnv(): Record<string, string | undefined> | undefined {
  try {
    if (typeof process === 'undefined') return undefined;
    const p: unknown = process;
    if (!p || typeof p !== 'object' || !('env' in p)) return undefined;
    const env = (p as { env?: unknown }).env;
    return env && typeof env === 'object' ? (env as Record<string, string | undefined>) : undefined;
  } catch {
    return undefined;
  }
}

export function getApiBase(override?: string): string {
  if (override !== undefined) return override;
  const ve = readViteEnv();
  const ne = readNodeEnv();
  const viteBase = ve?.VITE_API_BASE_URL ?? ne?.VITE_API_BASE_URL;
  if (viteBase) return viteBase;
  const nodeBase = ne?.API_BASE_URL;
  if (nodeBase) return nodeBase;
  // Vitest: allow relative URLs
  if (ne?.VITEST) return '';
  // Dev default
  return 'http://localhost:3010';
}

export function buildUrl(path: string, base?: string): string {
  // If path is absolute URL, return as-is
  if (/^https?:\/\//i.test(path)) return path;
  // Normalize path to start with '/'
  let p = path.startsWith('/') ? path : `/${path}`;
  const b = base !== undefined ? base : getApiBase();
  if (!b) return p; // allow relative for tests or explicit ''
  // Trim trailing slash from base
  const cleanedBase = b.endsWith('/') ? b.slice(0, -1) : b;
  // De-duplicate '/api' if both base and path include it
  if (cleanedBase.endsWith('/api') && p.startsWith('/api/')) {
    p = p.slice(4); // remove leading '/api' from path
  }
  return `${cleanedBase}${p}`;
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
