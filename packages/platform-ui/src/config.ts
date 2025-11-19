// Centralized environment configuration for platform-ui.
// Provides two env-resolved values and throws if missing.

type ViteEnv = {
  VITE_API_BASE_URL?: string;
};

function requireEnv(name: keyof ViteEnv): string {
  const val = import.meta.env?.[name];
  if (typeof val === 'string' && val.trim()) return val;
  throw new Error(`platform-ui config: required env ${String(name)} is missing`);
}

function stripTrailingSlash(pathname: string): string {
  if (pathname === '/') return '';
  return pathname.replace(/\/+$/, '');
}

function stripTrailingApi(pathname: string): string {
  return pathname.replace(/\/api\/?$/, '/');
}

function resolveUrl(raw: string): URL {
  const trimmed = raw.trim();
  try {
    return new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  } catch (_err) {
    // Attempt to coerce into absolute URL by prefixing with http://
    return new URL(trimmed, 'http://localhost');
  }
}

function deriveBase(raw: string, options: { stripApi: boolean }): string {
  const parsed = resolveUrl(raw);
  if (options.stripApi) parsed.pathname = stripTrailingApi(parsed.pathname);
  const cleanedPath = stripTrailingSlash(parsed.pathname);
  return cleanedPath ? `${parsed.origin}${cleanedPath}` : parsed.origin;
}

const rawApiBase = requireEnv('VITE_API_BASE_URL');

const apiBaseUrl = deriveBase(rawApiBase, { stripApi: true });
const socketBaseUrl = deriveBase(rawApiBase, { stripApi: true });

export const config = {
  apiBaseUrl,
  socketBaseUrl,
};

let cachedSocketBaseUrl: string | null = null;

export function getSocketBaseUrl(): string {
  if (!cachedSocketBaseUrl) cachedSocketBaseUrl = socketBaseUrl;
  return cachedSocketBaseUrl;
}
