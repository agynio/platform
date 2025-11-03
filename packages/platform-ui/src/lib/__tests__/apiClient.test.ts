import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import after setting env in each test to ensure evaluation uses current env

describe('apiClient base URL resolution', () => {
  beforeEach(async () => {
    // Reset modules so import.meta.env/process.env are re-read
    vi.resetModules();
  });
  afterEach(() => {
    // Clear all stubbed envs
    vi.unstubAllEnvs();
  });

  async function importFresh() {
    // dynamic import of the module to use current env
    const mod = await import('../../api/client');
    return mod as typeof import('../../api/client');
  }

  it('uses override argument first', async () => {
    const { getApiBase } = await importFresh();
    expect(getApiBase('https://x.example')).toBe('https://x.example');
  });

  it('prefers VITE_API_BASE_URL over others', async () => {
    // Simulate Vite env via global importMeta
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).importMeta = { env: { VITE_API_BASE_URL: 'https://vite.example' } };
    vi.stubEnv('API_BASE_URL', 'https://node.example');
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://vite.example');
  });

  it('falls back to API_BASE_URL when VITE_API_BASE_URL missing', async () => {
    // Remove vite env and set node env
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).importMeta = { env: {} };
    vi.stubEnv('API_BASE_URL', 'https://node.example');
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://node.example');
  });

  it('returns empty string when VITE_API_BASE_URL is explicitly empty (tests)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).importMeta = { env: { VITE_API_BASE_URL: '' } };
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('');
  });

  it('throws when no envs configured and no override', async () => {
    // Remove vite env
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).importMeta = { env: {} };
    vi.unstubAllEnvs();
    const { getApiBase } = await importFresh();
    expect(() => getApiBase()).toThrowError(/API base not configured/);
  });
});

describe('apiClient buildUrl edge cases', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function importFresh() {
    const mod = await import('../../api/client');
    return mod as typeof import('../../api/client');
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
