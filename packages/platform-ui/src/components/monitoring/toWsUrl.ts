export function toWsUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;

  const apiBase = import.meta.env?.VITE_API_BASE_URL;
  if (!apiBase || typeof apiBase !== 'string' || !apiBase.trim()) {
    throw new Error('terminal: VITE_API_BASE_URL is not configured');
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(apiBase);
  } catch {
    throw new Error('terminal: invalid VITE_API_BASE_URL value');
  }

  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : baseUrl.protocol === 'http:' ? 'ws:' : baseUrl.protocol;

  const resolved = new URL(path, baseUrl);
  return resolved.toString();
}
