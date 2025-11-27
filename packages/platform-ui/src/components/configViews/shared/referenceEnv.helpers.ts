export type EnvItem = {
  name: string;
  value: string;
  source?: 'static' | 'vault' | 'variable';
  meta?: { mount?: string | null };
};

export function normalizeEnvItems(value?: unknown): EnvItem[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((raw) => {
      const candidate = raw ?? {};
      const name =
        typeof (candidate as { name?: unknown }).name === 'string' && (candidate as { name: string }).name.trim().length
          ? ((candidate as { name: string }).name ?? '').trim()
          : typeof (candidate as { key?: unknown }).key === 'string'
            ? String((candidate as { key: string }).key).trim()
            : '';
      const sourceCandidate = (candidate as { source?: string }).source;
      const normalizedSource: 'static' | 'vault' | 'variable' =
        sourceCandidate === 'vault' || sourceCandidate === 'variable' ? sourceCandidate : 'static';
      const rawValue = (candidate as { value?: unknown }).value;
      const valueString = typeof rawValue === 'string' ? rawValue : '';
      const meta = (candidate as { meta?: { mount?: string | null } }).meta;
      return {
        name,
        value: valueString,
        source: normalizedSource,
        ...(meta ? { meta: { ...meta } } : {}),
      } satisfies EnvItem;
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
      name: key,
      value: typeof val === 'string' ? val : '',
      source: 'static' as const,
    } satisfies EnvItem));
  }
  return [];
}
