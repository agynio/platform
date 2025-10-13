import { describe, it, expect, vi } from 'vitest';
import { parseVaultRef } from '../utils/refs';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';

// Minimal fakes
class FakeContainerService {
  async findContainerByLabels(_labels?: any) { return undefined; }
  async start(opts: any) { return { id: 'c', exec: async () => ({ exitCode: 0 }), ...opts }; }
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
});
