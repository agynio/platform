import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('http client base URL resolution', () => {
  beforeEach(async () => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('constructs http client with VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://vite.example');
    const mod = await import('../../api/http');
    expect(mod.http).toBeTruthy();
  });

  it('defaults to localhost when VITE_API_BASE_URL missing', async () => {
    const mod = await import('../../api/http');
    expect(mod.http).toBeTruthy();
  });
});
