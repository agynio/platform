import { describe, it, expect } from 'vitest';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { NcpsKeyService } from '../src/core/services/ncpsKey.service';

describe('NcpsKeyService', () => {
  const baseEnv = {
    githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
    graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
    dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
    mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501',
    ncpsRefreshIntervalMs: '0', // disable periodic refresh for most tests
  } as const;

  it('fetches key successfully on init', async () => {
    const cfg = new ConfigService(configSchema.parse(baseEnv));
    const svc = new NcpsKeyService(cfg);
    // Inject mock fetch that returns a valid key
    svc.setFetchImpl(async () => new Response('cache:AAAAAAA=', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    await svc.init();
    expect(svc.hasKey()).toBe(true);
    expect(svc.getCurrentKey()).toBe('cache:AAAAAAA=');
    expect(svc.getKeysForInjection()).toEqual(['cache:AAAAAAA=']);
  });

  it('retries then succeeds', async () => {
    const cfg = new ConfigService(configSchema.parse({ ...baseEnv, ncpsStartupMaxRetries: '3', ncpsRetryBackoffMs: '1' }));
    const svc = new NcpsKeyService(cfg);
    let call = 0;
    svc.setFetchImpl(async () => {
      call++;
      if (call === 1) return new Response('', { status: 503 });
      return new Response('name:BBBBBBB=', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    });
    await svc.init();
    expect(svc.getCurrentKey()).toBe('name:BBBBBBB=');
  });

  it('persistent failure respects allow start config', async () => {
    const cfg1 = new ConfigService(configSchema.parse({ ...baseEnv, ncpsAllowStartWithoutKey: 'true', ncpsStartupMaxRetries: '2', ncpsRetryBackoffMs: '1' }));
    const svc1 = new NcpsKeyService(cfg1);
    svc1.setFetchImpl(async () => new Response('no', { status: 500 }));
    await svc1.init();
    expect(svc1.hasKey()).toBe(false);

    const cfg2 = new ConfigService(configSchema.parse({ ...baseEnv, ncpsAllowStartWithoutKey: 'false', ncpsStartupMaxRetries: '1', ncpsRetryBackoffMs: '1' }));
    const svc2 = new NcpsKeyService(cfg2);
    svc2.setFetchImpl(async () => new Response('no', { status: 500 }));
    await expect(svc2.init()).rejects.toBeTruthy();
  });

  it('rejects invalid or oversize payloads', async () => {
    const cfg = new ConfigService(configSchema.parse({ ...baseEnv, ncpsStartupMaxRetries: '0' }));
    const svc = new NcpsKeyService(cfg);
    svc.setFetchImpl(async () => new Response('not a key', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    await svc.init();
    expect(svc.hasKey()).toBe(false);
  });

  it('refresh picks up new key and keeps dual keys during rotation grace', async () => {
    // Enable short refresh interval
    const cfg = new ConfigService(
      configSchema.parse({ ...baseEnv, ncpsRefreshIntervalMs: '5', ncpsRotationGraceMinutes: '1', ncpsRetryBackoffMs: '1' }),
    );
    const svc = new NcpsKeyService(cfg);
    let c = 0;
    svc.setFetchImpl(async () => {
      c++;
      if (c === 1) return new Response('rot1:CCCCCC=', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      return new Response('rot2:DDDDDD=', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    });
    await svc.init();
    expect(svc.getKeysForInjection()).toEqual(['rot1:CCCCCC=']);

    // Next refresh returns different key
    // Manually trigger fetch (avoid waiting interval)
    await svc.triggerRefreshOnce();
    const keys = svc.getKeysForInjection();
    expect(keys.includes('rot1:CCCCCC=')).toBe(true);
    expect(keys.includes('rot2:DDDDDD=')).toBe(true);
    svc.stop();
  });

  it('uses undici dispatcher with custom CA for https (server URL)', async () => {
    const fs = await import('node:fs/promises');
    const caPath = '/tmp/mock-ca.pem';
    await fs.writeFile(caPath, '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n');
    const cfg = new ConfigService(
      configSchema.parse({
        ...baseEnv,
        // Ensure server URL is https to trigger dispatcher with CA
        ncpsUrlServer: 'https://ncps:8501',
        ncpsCaBundle: caPath,
        ncpsRefreshIntervalMs: '0',
      })
    );
    const svc = new NcpsKeyService(cfg);
    let seenDispatcher: import("undici").Dispatcher | undefined;
    svc.setFetchImpl(async (input: RequestInfo | URL, init?: RequestInit & { dispatcher?: import('undici').Dispatcher }) => {
      seenDispatcher = init?.dispatcher;
      return new Response('cache:ZZZZZZZ=', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    });
    await svc.init();
    expect(seenDispatcher).toBeTruthy();
    expect(svc.getCurrentKey()).toBe('cache:ZZZZZZZ=');
  });

  it('builds pubkey URL from server URL, not container URL', async () => {
    const cfg = new ConfigService(
      configSchema.parse({
        ...baseEnv,
        ncpsUrlServer: 'http://localhost:9999',
        ncpsUrlContainer: 'http://ncps:8501',
        ncpsRefreshIntervalMs: '0',
      })
    );
    const svc = new NcpsKeyService(cfg);
    let seenUrl: string | undefined;
    svc.setFetchImpl(async (input: RequestInfo | URL) => {
      seenUrl = String(input);
      return new Response('cache:PPPPPPP=', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    });
    await svc.init();
    expect(seenUrl).toBeDefined();
    expect(seenUrl?.startsWith('http://localhost:9999')).toBe(true);
    expect(seenUrl).toContain('/pubkey');
    expect(svc.getCurrentKey()).toBe('cache:PPPPPPP=');
  });
});
