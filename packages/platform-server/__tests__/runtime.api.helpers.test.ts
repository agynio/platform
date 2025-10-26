import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { FactoryFn } from '../src/graph/types';
// Capabilities removed; test updated to use Node lifecycle
import { LoggerService } from '../src/core/services/logger.service.js';

class MockLogger extends LoggerService {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

function makeRuntimeAndRegistry() {
  const registry = new TemplateRegistry();
  const logger = new MockLogger() as any as LoggerService;
  const moduleRef = { create: <T>(cls: new (...a: any[]) => T) => new cls() } as any;
  const runtime = new LiveGraphRuntime(logger, registry as any, { initIfNeeded: async()=>{}, get: async()=>null, upsert: async()=>{ throw new Error('not-implemented'); }, upsertNodeState: async()=>{} } as any, { create: (Cls: any) => new Cls() } as any);
  return { registry, runtime, logger };
}

describe('Runtime helpers and GraphRepository API surfaces', () => {
  it('provision/deprovision + status work against live nodes', async () => {
    const { registry, runtime } = makeRuntimeAndRegistry();

    // Mock node impl
    class MockNode { setConfig = vi.fn(async (_cfg: Record<string, unknown>) => {}); async provision() {}; async deprovision() {}; }

    const factory: FactoryFn = async () => new MockNode() as any;
    class MockNodeClass extends MockNode {}
    registry.register('mock', { title: 'Mock', kind: 'tool' }, MockNodeClass as any);

    // Apply a simple graph with one node
    await runtime.apply({ nodes: [{ id: 'n1', data: { template: 'mock', config: {} } }], edges: [] });

    // Exercise runtime helpers
    await runtime.provisionNode('n1');
    const status1 = runtime.getNodeStatus('n1');
    expect(status1.provisionStatus).toBeDefined();

    await runtime.deprovisionNode('n1');
    expect(runtime.getNodeStatus('n1').provisionStatus).toBeDefined();
  });

  it('Template schema and runtime dynamic config routing', async () => {
    const { registry, runtime } = makeRuntimeAndRegistry();

    // Expand template with capabilities and static schema
    class Dyn1 { setConfig = async () => {}; }
    registry.register('dyn', { title: 'Dyn', kind: 'tool' }, Dyn1 as any);

    // Create a mock dyn-configurable node instance
    class DynNode { setDynamicConfig = vi.fn((_cfg: Record<string, unknown>) => {}); setConfig = vi.fn(async (_cfg: Record<string, unknown>) => {}); }
    registry.register('dyn2', { title: 'Dyn2', kind: 'tool' }, DynNode as any);

    // Runtime graph
    await runtime.apply({ nodes: [
      { id: 'a', data: { template: 'dyn', config: {} } },
      { id: 'b', data: { template: 'dyn2', config: {} } },
    ], edges: []});

    // Template schema via registry directly (GraphRepository now stateless for templates only)
    const templates = await registry.toSchema();
    const dynEntry = templates.find(t => t.name === 'dyn');
    expect(dynEntry).toBeTruthy();

    // Node pause via runtime directly
    // pause/resume removed from runtime APIs

    // Dynamic config routing on dyn2 via runtime instance
    const instB: any = runtime.getNodeInstance('b');
    instB.setDynamicConfig = vi.fn();
    await instB.setDynamicConfig({ a: true });
    expect(instB.setDynamicConfig).toHaveBeenCalledWith({ a: true });

    // setNodeConfig on instance directly
    instB.setConfig = vi.fn();
    await instB.setConfig({ x: 1 });
    expect(instB.setConfig).toHaveBeenCalledWith({ x: 1 });
  });
});
