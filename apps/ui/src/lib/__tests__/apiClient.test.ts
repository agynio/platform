import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import after setting env in each test to ensure evaluation uses current env
const g: any = globalThis;

describe('apiClient base URL resolution', () => {
  let originalImportMeta: any;
  let originalProcessEnv: any;

  beforeEach(() => {
    originalImportMeta = (globalThis as any).importMeta;
    originalProcessEnv = g.process?.env ? { ...g.process.env } : undefined;
    // Ensure process.env exists
    if (!g.process) (g as any).process = { env: {} };
    if (!g.process.env) g.process.env = {} as any;
  });

  afterEach(() => {
    // Restore process env
    if (originalProcessEnv) {
      g.process.env = originalProcessEnv;
    } else if (g.process) {
      g.process.env = {} as any;
    }
    // Clean import cache to avoid module state leakage
    Object.keys((g as any).__vite_ssr_import__ || {}).forEach(() => {});
  });

  async function importFresh() {
    // dynamic import of the module to use current env
    const mod = await import('../../lib/apiClient');
    return mod;
  }

  it('uses override argument first', async () => {
    const { getApiBase } = await importFresh();
    expect(getApiBase('https://x.example')).toBe('https://x.example');
  });

  it('prefers VITE_API_BASE_URL over others', async () => {
    (g as any).importMeta = { env: { VITE_API_BASE_URL: 'https://vite.example' } };
    g.process.env.API_BASE_URL = 'https://node.example';
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://vite.example');
    (g as any).importMeta = undefined;
  });

  it('falls back to API_BASE_URL when VITE_API_BASE_URL missing', async () => {
    (g as any).importMeta = { env: {} };
    g.process.env.API_BASE_URL = 'https://node.example';
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://node.example');
    (g as any).importMeta = undefined;
  });

  it('falls back to legacy VITE_GRAPH_API_BASE when others missing', async () => {
    (g as any).importMeta = { env: { VITE_GRAPH_API_BASE: 'https://legacy.example' } };
    delete g.process.env.API_BASE_URL;
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://legacy.example');
    (g as any).importMeta = undefined;
  });

  it('returns empty string when VITEST is set', async () => {
    delete g.process.env.API_BASE_URL;
    g.process.env.VITEST = 'true';
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('');
    delete g.process.env.VITEST;
  });

  it('returns default localhost when no envs', async () => {
    delete g.process.env.API_BASE_URL;
    delete g.process.env.VITEST; // ensure vitest override is not applied
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('http://localhost:3010');
  });
});

describe('apiClient buildUrl edge cases', () => {
  const g: any = globalThis;
  beforeEach(() => {
    // Clear env influence for these tests
    if (!g.process) (g as any).process = { env: {} };
    g.process.env = {};
    (g as any).importMeta = { env: {} };
  });
  afterEach(() => {
    (g as any).importMeta = undefined;
  });

  async function importFresh() {
    const mod = await import('../../lib/apiClient');
    return mod;
  }

  it('joins base with leading slash path', async () => {
    const { buildUrl } = await importFresh();
    expect(buildUrl('/api/x', 'https://example.com')).toBe('https://example.com/api/x');
  });

  it('adds leading slash when missing in path', async () => {
    const { buildUrl } = await importFresh();
    expect(buildUrl('api/x', 'https://example.com')).toBe('https://example.com/api/x');
  });

  it('handles base with trailing slash', async () => {
    const { buildUrl } = await importFresh();
    expect(buildUrl('/api/x', 'https://example.com/')).toBe('https://example.com/api/x');
  });

  it('returns relative when base is empty string', async () => {
    const { buildUrl } = await importFresh();
    expect(buildUrl('api/x', '')).toBe('/api/x');
  });
});
