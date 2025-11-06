// Centralized environment configuration for platform-ui
// Minimal configuration: API base URL only (tracing config removed).

type ViteEnv = {
  VITE_API_BASE_URL?: string;
};

function readViteEnv(): ViteEnv | undefined {
  try {
    const fromGlobal = (globalThis as Record<string, unknown> | undefined)?.importMeta;
    const im = (typeof import.meta !== 'undefined' ? import.meta : undefined) ?? fromGlobal;
    if (im && typeof im === 'object' && 'env' in (im as Record<string, unknown>)) {
      const env = (im as { env?: unknown }).env;
      if (env && typeof env === 'object') return env as ViteEnv;
    }
    return undefined;
  } catch {
    return undefined;
  }
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

const ve = readViteEnv();
const ne = readNodeEnv();

// API base URL precedence (see README):
// 1) VITE_API_BASE_URL (Vite env)
// 2) API_BASE_URL (Node env) or VITE_API_BASE_URL (Node env)
// 3) VITEST: '' (tests use relative URLs)
// 4) default http://localhost:3010
function resolveApiBase(): string {
  const viteBase = ve?.VITE_API_BASE_URL;
  if (viteBase) return viteBase;
  const nodeBase = ne?.API_BASE_URL || ne?.VITE_API_BASE_URL;
  if (nodeBase) return nodeBase;
  if (ne?.VITEST) return '';
  return 'http://localhost:3010';
}

export const config = {
  apiBaseUrl: resolveApiBase(),
};
