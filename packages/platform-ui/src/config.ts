// Centralized environment configuration for platform-ui
// Provides resolved bases for API and Tracing services without side effects.

type ViteEnv = {
  VITE_API_BASE_URL?: string;
  VITE_TRACING_SERVER_URL?: string;
  VITE_TRACING_UI_BASE?: string;
  VITEST?: string | boolean;
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

function resolveApiBase(): string {
  const vite = ve?.VITE_API_BASE_URL;
  if (vite && vite.trim()) return vite;
  const node = ne?.API_BASE_URL;
  if (node && node.trim()) return node;
  // In Vitest, default to '' so tests can use relative handlers
  const isVitest = Boolean(ve?.VITEST || ne?.VITEST_WORKER_ID);
  if (isVitest) return '';
  // Fallback default for local dev
  return 'http://localhost:3010';
}
function resolveTracingServer(): string {
  // Precedence: VITE_TRACING_SERVER_URL -> TRACING_SERVER_URL -> apiBaseUrl + /tracing -> default
  const fromVite = ve?.VITE_TRACING_SERVER_URL;
  if (fromVite && fromVite.trim()) return fromVite;
  const fromNode = ne?.TRACING_SERVER_URL;
  if (fromNode && fromNode.trim()) return fromNode;
  const api = resolveApiBase();
  const fallback = api ? `${api}/tracing` : 'http://localhost:4319';
  return fallback.endsWith('/') ? fallback.slice(0, -1) : fallback;
}

function resolveTracingUiBase(): string {
  const fromVite = ve?.VITE_TRACING_UI_BASE;
  if (fromVite && fromVite.trim()) return fromVite;
  const fromNode = ne?.TRACING_UI_BASE;
  if (fromNode && fromNode.trim()) return fromNode;
  return 'http://localhost:4320';
}

export const config = {
  apiBaseUrl: resolveApiBase(),
  tracing: {
    serverUrl: resolveTracingServer(),
    uiBase: resolveTracingUiBase(),
  },
  // Legacy shape used in some components/providers
  tracingServerUrl: resolveTracingServer(),
};
