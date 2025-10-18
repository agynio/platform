import { stringify as toYamlStr } from 'yaml';

export function isJSONObject(v: unknown): v is Record<string, unknown> | unknown[] {
  if (v === null) return false;
  const t = typeof v;
  if (t === 'object') return true;
  return false;
}

export function toJSONStable(v: unknown): string {
  try {
    if (typeof v === 'string') {
      // Try parse then re-stringify for pretty formatting
      try {
        const parsed = JSON.parse(v);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return v;
      }
    }
    return JSON.stringify(v, null, 2);
  } catch {
    try {
      return String(v);
    } catch {
      return '';
    }
  }
}

export function toYAML(v: unknown): string {
  try {
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        return toYamlStr(parsed);
      } catch {
        // If not JSON string, wrap as plain string
        return toYamlStr(v);
      }
    }
    return toYamlStr(v);
  } catch {
    try {
      return String(v);
    } catch {
      return '';
    }
  }
}

