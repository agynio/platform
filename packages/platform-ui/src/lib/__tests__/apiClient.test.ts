import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('http client base URL resolution', () => {
  beforeEach(async () => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('constructs http client with configured base URL', async () => {
    // Override import.meta.env provided in vitest.setup.ts for this test
    (globalThis as any).importMeta = { env: { VITE_API_BASE_URL: 'https://vite.example', VITE_TRACING_SERVER_URL: 'https://tracing.example' } };
    const mod = await import('../../api/http');
    expect(mod.http).toBeTruthy();
    expect(mod.tracingHttp).toBeTruthy();
  });
});
