export { cn } from '@hautech/ui';

// Minimal equality helpers (JSON-based deep equality acceptable for hotfix)
export function deepEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Fallback: strict equality only if serialization fails
    return a === b;
  }
}

export function shallowEqual<T extends Record<string, unknown>>(a: T | undefined, b: T | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
