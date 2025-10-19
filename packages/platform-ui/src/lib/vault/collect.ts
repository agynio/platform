// Collect vault references from node config objects. A reference is any object
// with shape { value: string, source: 'vault' } (including env arrays).

export function collectVaultRefs(input: unknown): string[] {
  const out = new Set<string>();

  function visit(v: unknown) {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const it of v) visit(it);
      return;
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      // Shape match for ReferenceField-like objects
      if (typeof o.value === 'string' && (o.source === 'vault' || (o.source as string) === 'vault')) {
        out.add(o.value as string);
      }
      for (const k of Object.keys(o)) visit(o[k]);
      return;
    }
  }

  visit(input);
  return Array.from(out);
}

