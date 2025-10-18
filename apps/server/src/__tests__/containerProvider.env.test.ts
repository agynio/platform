import { describe, it, expect } from 'vitest';
import { parseVaultRef } from '../utils/refs';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ConfigService, configSchema } from '../services/config.service';
import { ContainerService } from '../services/container.service';
import { LoggerService } from '../services/logger.service';
import { VaultService } from '../services/vault.service';

// Typed fakes (no any)
class FakeContainerService extends ContainerService {
  constructor() { super(new LoggerService()); }
  override async findContainerByLabels(): Promise<ReturnType<ContainerService['findContainerByLabels']> extends Promise<infer R> ? R : never> {
    return undefined as any;
  }
  override async findContainersByLabels(): Promise<ReturnType<ContainerService['findContainersByLabels']> extends Promise<infer R> ? R : never> {
    return [] as any;
  }
  override async start(opts?: Parameters<ContainerService['start']>[0]): Promise<ReturnType<ContainerService['start']> extends Promise<infer R> ? R : never> {
    // Return a minimal ContainerEntity-like object matching usage in tests
    return { id: 'c', exec: async () => ({ exitCode: 0 }), ...opts } as any;
  }
  override async getContainerLabels(): Promise<Record<string, string>> {
    return {};
  }
}

class FakeVaultService extends VaultService {
  constructor() { super({ enabled: true, addr: 'http://vault:8200', token: 'x' }); }
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
    const container: any = await ent.provide('t');
    expect(container.env.A).toBe('x');
    expect(container.env.B).toBe('VAL');
    // labels should include role=workspace now
    expect(container.labels['hautech.ai/role']).toBe('workspace');
  });

  it('does not inject NIX_CONFIG when already present', async () => {
    const svc = new FakeContainerService();
    const cfg = configSchema.parse({
      githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
      graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
      mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501', ncpsPublicKey: 'abc:xyz'
    });
    const ent = new ContainerProviderEntity(svc, undefined, { env: { NIX_CONFIG: 'keep=me' } }, () => ({}), new ConfigService(cfg));
    ent.setConfig({});
    const container: any = await ent.provide('t2');
    expect(container.env.NIX_CONFIG).toBe('keep=me');
  });

  it('injects NIX_CONFIG only when ncps enabled and URL+PUBLIC_KEY present', async () => {
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
    const ent1 = new ContainerProviderEntity(svc, undefined as any, {}, () => ({}), cfgFalse);
    ent1.setConfig({});
    const c1: any = await ent1.provide('t3');
    expect(c1.env?.NIX_CONFIG).toBeUndefined();

    // Case 2: enabled=true but missing public key -> no injection
    const cfgMissingKey = new ConfigService(
      configSchema.parse({
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501',
      }),
    );
    const ent2 = new ContainerProviderEntity(svc, undefined as any, {}, () => ({}), cfgMissingKey);
    ent2.setConfig({});
    const c2: any = await ent2.provide('t4');
    expect(c2.env?.NIX_CONFIG).toBeUndefined();

    // Case 3: enabled=true and both present -> inject
    const cfgTrue = new ConfigService(
      configSchema.parse({
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501', ncpsPublicKey: 'pub:key',
      }),
    );
    const ent3 = new ContainerProviderEntity(svc, undefined as any, {}, () => ({}), cfgTrue);
    ent3.setConfig({});
    const c3: any = await ent3.provide('t5');
    expect(c3.env?.NIX_CONFIG).toContain('substituters = http://ncps:8501');
    expect(c3.env?.NIX_CONFIG).toContain('trusted-public-keys = pub:key');
  });
});
