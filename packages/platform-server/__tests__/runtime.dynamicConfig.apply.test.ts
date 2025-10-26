import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { ModuleRef } from '@nestjs/core';
import { LoggerService } from '../src/core/services/logger.service.js';

class MockLogger extends LoggerService { info=vi.fn(); debug=vi.fn(); error=vi.fn(); }

describe.skip('Runtime dynamicConfig first-class support', () => {
  it('applies dynamicConfig on instantiate and update', async () => {
    const moduleRef = { create: (Cls: any) => new Cls() } as ModuleRef;
    const registry = new TemplateRegistry(moduleRef as unknown as any);
    const logger = new MockLogger() as any as LoggerService;
    class StubRepo2 extends GraphRepository { async initIfNeeded(): Promise<void> {} async get(): Promise<any> { return null; } async upsert(): Promise<any> { throw new Error('not-implemented'); } async upsertNodeState(): Promise<void> {} }
    const runtime = new LiveGraphRuntime(logger, registry, new StubRepo2(), { create: (Cls: any) => new Cls() } as any);

    const instSetDynamic = vi.fn();
    const dynStore: any[] = [];
    class DynNodeImpl {
      setConfig = vi.fn();
      setDynamicConfig = (cfg: Record<string, unknown>) => { instSetDynamic(cfg); dynStore.push(cfg); };
      isDynamicConfigReady = () => true;
      getDynamicConfigSchema = () => ({ type: 'object', properties: { a: { type: 'boolean' } } });
    }
    registry.register('dynNode', { title: 'Dyn', kind: 'tool', capabilities: { dynamicConfigurable: true } }, DynNodeImpl as any);

    await runtime.apply({ nodes: [{ id: 'n1', data: { template: 'dynNode', dynamicConfig: { a: true } } }], edges: [] });
    expect(instSetDynamic).toHaveBeenCalledWith({ a: true });

    await runtime.apply({ nodes: [{ id: 'n1', data: { template: 'dynNode', dynamicConfig: { a: false } } }], edges: [] });
    // Last call should reflect update
    expect(instSetDynamic).toHaveBeenLastCalledWith({ a: false });
    expect(dynStore[dynStore.length - 1]).toEqual({ a: false });
  });
});
