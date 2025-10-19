// Centralized SSR/test environment detection helpers
// Keep typed and minimal to avoid casts in components/services.

export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
export const isTest = typeof process !== 'undefined' && !!process.env && process.env.VITEST === 'true';

