import { describe, it, expect, vi } from 'vitest';
import { parseVaultRef } from '../utils/refs';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ConfigService, type Config } from '../services/config.service';

// Minimal fakes
class FakeContainerService {
  async findContainerByLabels(_labels?: any) { return undefined; }
  async findContainersByLabels(_labels?: any) { return []; }
  async start(opts: any) { return { id: 'c', exec: async () => ({ exitCode: 0 }), ...opts }; }
  async getContainerLabels() { return {}; }
}
class FakeVault { isEnabled() { return true; } async getSecret() { return 'VAL'; } }

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
    const svc = new FakeContainerService() as any;
    const vault = new FakeVault() as any;
    const ent = new ContainerProviderEntity(svc, vault, {}, () => ({}));
    ent.setConfig({ env: [ { key: 'A', value: 'x' }, { key: 'B', value: 'secret/path/key', source: 'vault' } ] });
    const container: any = await ent.provide('t');
    expect(container.env.A).toBe('x');
    expect(container.env.B).toBe('VAL');
    // labels should include role=workspace now
    expect(container.labels['hautech.ai/role']).toBe('workspace');
  });

  it('does not inject NIX_CONFIG when already present', async () => {
    const svc = new FakeContainerService() as any;
    const ent = new ContainerProviderEntity(svc, undefined as any, { env: { NIX_CONFIG: 'keep=me' } }, () => ({}), new ConfigService({
      // minimal required fields for ConfigService
      githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
      graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: ['nixpkgs-unstable'], nixHttpTimeoutMs: 5000, nixCacheTtlMs: 300000, nixCacheMax: 500,
      mcpToolsStaleTimeoutMs: 0, ncpsEnabled: true, ncpsUrl: 'http://ncps:8501', ncpsPublicKey: 'abc:xyz'
    } as unknown as Config));
    ent.setConfig({});
    const container: any = await ent.provide('t2');
    expect(container.env.NIX_CONFIG).toBe('keep=me');
  });

  it('injects NIX_CONFIG only when ncps enabled and URL+PUBLIC_KEY present', async () => {
    const svc = new FakeContainerService() as any;
    // Case 1: enabled=false -> no injection
    const cfgFalse = new ConfigService({
      githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
      graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: ['nixpkgs-unstable'], nixHttpTimeoutMs: 5000, nixCacheTtlMs: 300000, nixCacheMax: 500,
      mcpToolsStaleTimeoutMs: 0, ncpsEnabled: false, ncpsUrl: 'http://ncps:8501', ncpsPublicKey: undefined,
    } as unknown as Config);
    const ent1 = new ContainerProviderEntity(svc, undefined as any, {}, () => ({}), cfgFalse);
    ent1.setConfig({});
    const c1: any = await ent1.provide('t3');
    expect(c1.env?.NIX_CONFIG).toBeUndefined();

    // Case 2: enabled=true but missing public key -> no injection
    const cfgMissingKey = new ConfigService({
      githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
      graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: ['nixpkgs-unstable'], nixHttpTimeoutMs: 5000, nixCacheTtlMs: 300000, nixCacheMax: 500,
      mcpToolsStaleTimeoutMs: 0, ncpsEnabled: true, ncpsUrl: 'http://ncps:8501', ncpsPublicKey: undefined,
    } as unknown as Config);
    const ent2 = new ContainerProviderEntity(svc, undefined as any, {}, () => ({}), cfgMissingKey);
    ent2.setConfig({});
    const c2: any = await ent2.provide('t4');
    expect(c2.env?.NIX_CONFIG).toBeUndefined();

    // Case 3: enabled=true and both present -> inject
    const cfgTrue = new ConfigService({
      githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
      graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: ['nixpkgs-unstable'], nixHttpTimeoutMs: 5000, nixCacheTtlMs: 300000, nixCacheMax: 500,
      mcpToolsStaleTimeoutMs: 0, ncpsEnabled: true, ncpsUrl: 'http://ncps:8501', ncpsPublicKey: 'pub:key',
    } as unknown as Config);
    const ent3 = new ContainerProviderEntity(svc, undefined as any, {}, () => ({}), cfgTrue);
    ent3.setConfig({});
    const c3: any = await ent3.provide('t5');
    expect(c3.env?.NIX_CONFIG).toContain('substituters = http://ncps:8501');
    expect(c3.env?.NIX_CONFIG).toContain('trusted-public-keys = pub:key');
  });
});
