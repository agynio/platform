import { stringify as toYamlStr } from 'yaml';

// Recursively sort object keys to ensure deterministic ordering
function stabilize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => stabilize(v));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => {
        out[k] = stabilize(obj[k]);
      });
    return out;
  }
  return value;
}

export function toJSONStable(v: unknown): string {
  try {
    let data: unknown = v;
    if (typeof v === 'string') {
      try {
        data = JSON.parse(v);
      } catch {
        // Return as-is when non-JSON string; caller may decide to warn
        return v;
      }
    }
    return JSON.stringify(stabilize(data), null, 2);
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
    let data: unknown = v;
    if (typeof v === 'string') {
      try {
        data = JSON.parse(v);
      } catch {
        // keep as string in YAML
        data = v;
      }
    }
    return toYamlStr(stabilize(data));
  } catch {
    try {
      return String(v);
    } catch {
      return '';
    }
  }
}
