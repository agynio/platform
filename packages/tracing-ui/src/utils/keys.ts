// Utility to normalize key parts for localStorage keys
export function normalizeKeyPart(input: unknown): string {
  try {
    const s = String(input ?? '').toLowerCase();
    // keep alphanum, dash, underscore; replace others with hyphen
    return s
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-/g, '')
      .replace(/-$/g, '');
  } catch {
    return '';
  }
}

export function makeStorageKey(parts: (string | number)[]): string {
  const norm = parts.map((p) => normalizeKeyPart(p)).filter(Boolean);
  return ['obsui', 'view', ...norm].join(':');
}
