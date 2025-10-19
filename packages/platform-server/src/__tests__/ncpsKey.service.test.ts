import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConfigService, configSchema } from '../services/config.service';
import { NcpsKeyService } from '../services/ncpsKey.service';

describe('NcpsKeyService', () => {
  const baseEnv = {
    githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
    graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
    dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
    mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501',
    ncpsRefreshIntervalMs: '0', // disable periodic refresh for most tests
  } as const;

  beforeEach(() => {
    nock.cleanAll();
  });
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches key successfully on init', async () => {
    nock('http://ncps:8501').get('/pubkey').reply(200, 'cache:AAAAAAA=');
    const cfg = new ConfigService(configSchema.parse(baseEnv));
    const svc = new NcpsKeyService(cfg);
    await svc.init();
    expect(svc.hasKey()).toBe(true);
    expect(svc.getCurrentKey()).toBe('cache:AAAAAAA=');
    expect(svc.getKeysForInjection()).toEqual(['cache:AAAAAAA=']);
  });

  it('retries then succeeds', async () => {
    const scope = nock('http://ncps:8501');
    scope.get('/pubkey').reply(503, '');
    scope.get('/pubkey').reply(200, 'name:BBBBBBB=');
    const cfg = new ConfigService(configSchema.parse({ ...baseEnv, ncpsStartupMaxRetries: '3', ncpsRetryBackoffMs: '1' }));
    const svc = new NcpsKeyService(cfg);
    await svc.init();
    expect(svc.getCurrentKey()).toBe('name:BBBBBBB=');
  });

  it('persistent failure respects allow start config', async () => {
    nock('http://ncps:8501').get('/pubkey').times(5).reply(500, 'no');
    const cfg1 = new ConfigService(configSchema.parse({ ...baseEnv, ncpsAllowStartWithoutKey: 'true', ncpsStartupMaxRetries: '2', ncpsRetryBackoffMs: '1' }));
    const svc1 = new NcpsKeyService(cfg1);
    await svc1.init();
    expect(svc1.hasKey()).toBe(false);

    const cfg2 = new ConfigService(configSchema.parse({ ...baseEnv, ncpsAllowStartWithoutKey: 'false', ncpsStartupMaxRetries: '1', ncpsRetryBackoffMs: '1' }));
    const svc2 = new NcpsKeyService(cfg2);
    await expect(svc2.init()).rejects.toBeTruthy();
  });

  it('rejects invalid or oversize payloads', async () => {
    nock('http://ncps:8501').get('/pubkey').reply(200, 'not a key');
    const cfg = new ConfigService(configSchema.parse({ ...baseEnv, ncpsStartupMaxRetries: '0' }));
    const svc = new NcpsKeyService(cfg);
    await svc.init();
    expect(svc.hasKey()).toBe(false);
  });

  it('refresh picks up new key and keeps dual keys during rotation grace', async () => {
    // Enable short refresh interval
    const cfg = new ConfigService(
      configSchema.parse({ ...baseEnv, ncpsRefreshIntervalMs: '5', ncpsRotationGraceMinutes: '1', ncpsRetryBackoffMs: '1' }),
    );
    const scope = nock('http://ncps:8501');
    scope.get('/pubkey').reply(200, 'rot1:CCCCCC=');
    const svc = new NcpsKeyService(cfg);
    await svc.init();
    expect(svc.getKeysForInjection()).toEqual(['rot1:CCCCCC=']);

    // Next refresh returns different key
    scope.get('/pubkey').reply(200, 'rot2:DDDDDD=');
    // Manually trigger fetch (avoid waiting interval)
    await (svc as any).fetchWithRetries();
    const keys = svc.getKeysForInjection();
    expect(keys.includes('rot1:CCCCCC=')).toBe(true);
    expect(keys.includes('rot2:DDDDDD=')).toBe(true);
    svc.stop();
  });
});

