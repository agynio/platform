import { describe, it, expect, vi } from 'vitest';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { LoggerService } from '../services/logger.service';

class FakeRegistry {
  lastUsed: string[] = [];
  async updateLastUsed(id: string) { this.lastUsed.push(id); }
  async registerStart() {}
}

class FakeContainerService {
  private _registry?: FakeRegistry;
  setRegistry(r: any) { this._registry = r; }
  async findContainerByLabels() { return undefined; }
  async findContainersByLabels() { return []; }
  async start() { return { id: 'cid123', exec: async () => ({ exitCode: 0 }) }; }
  async getContainerLabels() { return {}; }
  async touchLastUsed(id: string) { await this._registry?.updateLastUsed(id); }
}

describe('ContainerProvider + registry hooks', () => {
  it('updates last_used on provide()', async () => {
    const svc = new FakeContainerService() as any;
    const reg = new FakeRegistry();
    svc.setRegistry(reg);
    const provider = new ContainerProviderEntity(svc, {} as any, {}, () => ({ 'hautech.ai/thread_id': 'node__t' }));
    provider.setConfig({ ttlSeconds: 86400 });
    const c = await provider.provide('t');
    expect(c.id).toBe('cid123');
    expect(reg.lastUsed).toContain('cid123');
  });
});
