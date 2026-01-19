import { getSocketBaseUrl } from '@/config';

function resolveSocketBase(): URL {
  const fallbackBase = getSocketBaseUrl();
  const raw = import.meta.env?.VITE_API_BASE_URL;

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const resolved = new URL(raw.trim(), typeof window !== 'undefined' ? window.location.origin : fallbackBase);
      return resolved;
    } catch {
      throw new Error('terminal: invalid VITE_API_BASE_URL value');
    }
  }

  return new URL(fallbackBase);
}

export function toWsUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;

  const baseUrl = resolveSocketBase();
  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : baseUrl.protocol === 'http:' ? 'ws:' : baseUrl.protocol;

  const resolved = new URL(path, baseUrl);
  return resolved.toString();
}
