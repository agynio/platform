// Collect vault references from node config objects. Supports legacy references
// { value: string, source: 'vault' } and canonical vault objects
// { kind: 'vault', mount, path, key }, including canonical values nested under
// { source: 'vault', value }.

export function collectVaultRefs(input: unknown): string[] {
  const out = new Set<string>();

  function isVaultSource(value: unknown): boolean {
    return value === 'vault';
  }

  function normalizeSegment(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw.trim().replace(/^\/+|\/+$/g, '');
  }

  function normalizeCanonical(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const record = raw as Record<string, unknown>;
    if (record.kind !== 'vault') return undefined;
    const mount = normalizeSegment(record.mount);
    if (!mount) return undefined;
    const path = normalizeSegment(record.path);
    const key = normalizeSegment(record.key);
    if (!path || !key) return undefined;
    return [mount, path, key].join('/');
  }

  function visit(v: unknown) {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const it of v) visit(it);
      return;
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.value === 'string' && isVaultSource(o.source)) {
        out.add(o.value);
      }
      if (isVaultSource(o.source)) {
        const normalizedFromValue = normalizeCanonical(o.value);
        if (normalizedFromValue) out.add(normalizedFromValue);
      }
      const normalized = normalizeCanonical(o);
      if (normalized) out.add(normalized);
      for (const k of Object.keys(o)) visit(o[k]);
      return;
    }
  }

  visit(input);
  return Array.from(out);
}
