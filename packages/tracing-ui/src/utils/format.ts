import { stringify as toYamlStr } from 'yaml';

// Duration auto-scaling formatter
export interface DurationUnitLabels { ms: string; s: string; m: string; h: string }
export interface FormatDurationOptions {
  truncate?: boolean; // default false (round when false)
  unitLabels?: DurationUnitLabels; // default { ms: 'ms', s: 's', m: 'm', h: 'h' }
  space?: boolean; // default true; when true includes a space between value and unit
}

const DEFAULT_LABELS: DurationUnitLabels = { ms: 'ms', s: 's', m: 'm', h: 'h' };

export function formatDuration(ms: number | null | undefined, opts?: FormatDurationOptions): string {
  if (ms === null || ms === undefined || Number.isNaN(ms as number)) return '-';
  const value = Number(ms);
  if (!Number.isFinite(value)) return '-';
  const labels = opts?.unitLabels || DEFAULT_LABELS;
  const space = opts?.space ?? true;
  const sep = space ? ' ' : '';

  if (value === 0) return `0${sep}${labels.ms}`;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  const oneSecond = 1000;
  const oneMinute = 60 * oneSecond;
  const oneHour = 60 * oneMinute;

  // Unit selection based on thresholds BEFORE rounding/truncation
  if (abs < oneSecond) {
    return `${sign}${Math.trunc(abs)}${sep}${labels.ms}`; // integer milliseconds
  }

  let num: number;
  let unit: keyof DurationUnitLabels;
  if (abs < oneMinute) {
    num = abs / oneSecond; unit = 's';
  } else if (abs < oneHour) {
    num = abs / oneMinute; unit = 'm';
  } else {
    num = abs / oneHour; unit = 'h';
  }
  const scaled = opts?.truncate ? Math.trunc(num * 10) / 10 : Math.round(num * 10) / 10;
  return `${sign}${scaled.toFixed(1)}${sep}${labels[unit]}`;
}

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
