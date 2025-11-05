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
    // Rely on TS inference; avoid explicit import() type annotation to satisfy ESLint
    return mod;
  }

  it('uses override argument first', async () => {
    const { getApiBase } = await importFresh();
    expect(getApiBase('https://x.example')).toBe('https://x.example');
  });

  it('prefers VITE_API_BASE_URL over others', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://vite.example');
    vi.stubEnv('API_BASE_URL', 'https://node.example');
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://vite.example');
  });

  it('falls back to API_BASE_URL when VITE_API_BASE_URL missing', async () => {
    vi.stubEnv('API_BASE_URL', 'https://node.example');
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://node.example');
  });


  it('throws when no envs configured and no override', async () => {
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
    // Rely on TS inference; avoid explicit import() type annotation to satisfy ESLint
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
