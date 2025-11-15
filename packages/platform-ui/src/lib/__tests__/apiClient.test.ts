import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('http client base URL resolution', () => {
  beforeEach(async () => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('constructs http client with configured base URL', async () => {
    vi.mock('@/config', () => ({
      config: {
        apiBaseUrl: 'https://vite.example',
        tracingApiBaseUrl: 'https://tracing.example',
        socketBaseUrl: 'https://vite.example',
      },
      getSocketBaseUrl: () => 'https://vite.example',
    }));
    const mod = await import('../../api/http');
    expect(mod.http).toBeTruthy();
    expect(mod.tracingHttp).toBeTruthy();
  });
});
