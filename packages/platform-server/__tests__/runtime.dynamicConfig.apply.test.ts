import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { LoggerService } from '../src/core/services/logger.service.js';

class MockLogger extends LoggerService { info=vi.fn(); debug=vi.fn(); error=vi.fn(); }

describe('Runtime dynamicConfig first-class support', () => {
  it('applies dynamicConfig on instantiate and update', async () => {
    const registry = new TemplateRegistry();
    const logger = new MockLogger() as any as LoggerService;
    const runtime = new LiveGraphRuntime(logger, registry);

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
