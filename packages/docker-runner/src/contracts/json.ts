const isBufferLike = (val: unknown): val is Buffer | Uint8Array =>
  typeof Buffer !== 'undefined' && (Buffer.isBuffer(val) || val instanceof Uint8Array);

export function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (isBufferLike(value)) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(
      entries
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, val]) => [key, canonicalize(val)]),
    );
  }
  return value;
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
