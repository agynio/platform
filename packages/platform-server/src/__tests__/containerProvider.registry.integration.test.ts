import { describe, it, expect, vi } from 'vitest';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ContainerService } from '../core/services/container.service';
import { ContainerEntity } from '../entities/container.entity';
import { LoggerService } from '../core/services/logger.service';
import type { ContainerRegistryService } from '../services/containerRegistry.service';

class FakeRegistry implements Pick<ContainerRegistryService, 'updateLastUsed' | 'registerStart'> {
  lastUsed: string[] = [];
  async updateLastUsed(id: string) { this.lastUsed.push(id); }
  async registerStart() {}
}

type MinimalRegistry = Pick<ContainerRegistryService, 'updateLastUsed' | 'registerStart'>;
class FakeContainerService extends ContainerService {
  private _registry?: MinimalRegistry;
  constructor() { super(new LoggerService()); }
  setRegistry(r: MinimalRegistry) { this._registry = r; }
  override async findContainerByLabels(): Promise<ContainerEntity | undefined> { return undefined; }
  override async findContainersByLabels(): Promise<ContainerEntity[]> { return []; }
  override async start(): Promise<ContainerEntity> { return new ContainerEntity(this, 'cid123'); }
  override async getContainerLabels(): Promise<Record<string, string>> { return {}; }
  override async touchLastUsed(id: string): Promise<void> { await this._registry?.updateLastUsed(id); }
}

describe('ContainerProvider + registry hooks', () => {
  it('updates last_used on provide()', async () => {
    const svc = new FakeContainerService();
    const reg = new FakeRegistry();
    svc.setRegistry(reg);
    const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({ 'hautech.ai/thread_id': 'node__t' }));
    provider.setConfig({ ttlSeconds: 86400 });
    const c = await provider.provide('t');
    expect(c.id).toBe('cid123');
    expect(reg.lastUsed).toContain('cid123');
  });
});
