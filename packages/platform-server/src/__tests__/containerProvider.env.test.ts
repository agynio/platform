import { describe, it, expect } from 'vitest';
import { parseVaultRef } from '../utils/refs';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ConfigService, configSchema } from '../core/services/config.service';
import { NcpsKeyService } from '../core/services/ncpsKey.service';
import { ContainerService, type ContainerOpts } from '../core/services/container.service';
import { LoggerService } from '../core/services/logger.service';
import { VaultService } from '../core/services/vault.service';

// Test ContainerEntity with exposed env/labels for assertions
class TestContainerEntity extends (await import('../entities/container.entity')).ContainerEntity {
  constructor(service: ContainerService, id: string, public env: Record<string, string>, public labels: Record<string, string>) {
    super(service, id);
  }
}

// Typed fakes (no any)
class FakeContainerService extends ContainerService {
  constructor() { super(new LoggerService()); }
  override async findContainerByLabels(): Promise<ReturnType<ContainerService['findContainerByLabels']> extends Promise<infer R> ? R : never> {
    return undefined as never;
  }
  override async findContainersByLabels(): Promise<ReturnType<ContainerService['findContainersByLabels']> extends Promise<infer R> ? R : never> {
    return [] as never;
  }
  override async start(opts?: ContainerOpts): Promise<TestContainerEntity> {
    const env: Record<string, string> = (opts?.env && !Array.isArray(opts.env) ? opts.env : {}) || {};
    const labels: Record<string, string> = opts?.labels || {};
    return new TestContainerEntity(this, 'c', env, labels);
  }
  override async getContainerLabels(): Promise<Record<string, string>> {
    return {};
  }
}

class FakeVaultService extends VaultService {
  constructor() {
    super({ enabled: true, addr: 'http://vault:8200', token: 'x', timeoutMs: 30000, defaultMounts: ['secret'] });
  }
  override isEnabled(): boolean { return true; }
  override async getSecret(): Promise<string | undefined> { return 'VAL'; }
}

describe('ContainerProviderEntity parseVaultRef', () => {
  it('parses valid refs', () => {
    expect(parseVaultRef('secret/github/GH_TOKEN')).toEqual({ mount: 'secret', path: 'github', key: 'GH_TOKEN' });
    expect(parseVaultRef('a/b/c/d')).toEqual({ mount: 'a', path: 'b/c', key: 'd' });
  });
  it('rejects invalid refs', () => {
    expect(() => parseVaultRef('')).toThrow();
    expect(() => parseVaultRef('/a/b')).toThrow();
    expect(() => parseVaultRef('a/b')).toThrow();
  });

  it('merges env array and resolves vault entries', async () => {
    const svc = new FakeContainerService();
    const vault = new FakeVaultService();
    const ent = new ContainerProviderEntity(svc, vault, {}, () => ({}));
    ent.setConfig({ env: [ { key: 'A', value: 'x' }, { key: 'B', value: 'secret/path/key', source: 'vault' } ] });
    const container = (await ent.provide('t')) as TestContainerEntity;
    expect(container.env['A']).toBe('x');
    expect(container.env['B']).toBe('VAL');
    // labels should include role=workspace now
    expect(container.labels['hautech.ai/role']).toBe('workspace');
  });

  it('does not inject NIX_CONFIG when already present', async () => {
    const svc = new FakeContainerService();
    const cfg = configSchema.parse({
      githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
      graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
      mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501'
    });
    const ent = new ContainerProviderEntity(svc, undefined, { env: { NIX_CONFIG: 'keep=me' } }, () => ({}), new ConfigService(cfg), new NcpsKeyService(new ConfigService(cfg)));
    ent.setConfig({});
    const container = (await ent.provide('t2')) as TestContainerEntity;
    expect(container.env['NIX_CONFIG']).toBe('keep=me');
  });

  it('injects NIX_CONFIG only when ncps enabled and URL+key present', async () => {
    const svc = new FakeContainerService();
    // Case 1: enabled=false -> no injection
    const cfgFalse = new ConfigService(
      configSchema.parse({
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'false', ncpsUrl: 'http://ncps:8501',
      }),
    );
    const ent1 = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfgFalse, new NcpsKeyService(cfgFalse));
    ent1.setConfig({});
    const c1 = (await ent1.provide('t3')) as TestContainerEntity;
    expect(c1.env?.['NIX_CONFIG']).toBeUndefined();

    // Case 2: enabled=true but missing key -> no injection
    const cfgMissingKey = new ConfigService(
      configSchema.parse({
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501',
      }),
    );
    const ent2 = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfgMissingKey, new NcpsKeyService(cfgMissingKey));
    ent2.setConfig({});
    const c2 = (await ent2.provide('t4')) as TestContainerEntity;
    expect(c2.env?.['NIX_CONFIG']).toBeUndefined();

    // Case 3: enabled=true and key present -> inject
    const cfgTrue = new ConfigService(
      configSchema.parse({
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501',
      }),
    );
    const keySvc = new NcpsKeyService(cfgTrue);
    // Seed key via helper for test
    keySvc.seedKeyForTest('pub:key');
    const ent3 = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfgTrue, keySvc);
    ent3.setConfig({});
    const c3 = (await ent3.provide('t5')) as TestContainerEntity;
    expect(c3.env?.['NIX_CONFIG']).toContain('substituters = http://ncps:8501');
    expect(c3.env?.['NIX_CONFIG']).toContain('trusted-public-keys = pub:key');
  });

  it('uses container URL for NIX_CONFIG and server URL for key fetch when dual URLs provided', async () => {
    const svc = new FakeContainerService();
    const cfg = new ConfigService(
      configSchema.parse({
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true',
        ncpsUrlServer: 'http://localhost:8501',
        ncpsUrlContainer: 'http://ncps:8501',
        ncpsRefreshIntervalMs: '0',
      }),
    );
    const keySvc = new NcpsKeyService(cfg);
    keySvc.setFetchImpl(async (input: RequestInfo | URL) => new Response('cache:KEY=', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    await keySvc.init();
    const ent = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfg, keySvc);
    ent.setConfig({});
    const c = (await ent.provide('t6')) as TestContainerEntity;
    expect(c.env?.['NIX_CONFIG']).toContain('substituters = http://ncps:8501');
  });

  it('backward compat: only NCPS_URL set resolves both server and container to same value', async () => {
    const svc = new FakeContainerService();
    const prevEnv = { ...process.env };
    try {
      process.env.NCPS_URL = 'http://ncps:9999';
      process.env.NCPS_ENABLED = 'true';
      const cfg = ConfigService.fromEnv();
      const keySvc = new NcpsKeyService(cfg);
      keySvc.seedKeyForTest('legacy:key');
      const ent = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfg, keySvc);
      ent.setConfig({});
      const c = (await ent.provide('t7')) as TestContainerEntity;
      expect(cfg.ncpsUrlServer).toBe('http://ncps:9999');
      expect(cfg.ncpsUrlContainer).toBe('http://ncps:9999');
      expect(c.env?.['NIX_CONFIG']).toContain('substituters = http://ncps:9999');
    } finally {
      process.env = prevEnv;
    }
  });
});
