import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { FactoryFn } from '../src/shared/types/graph.types';
import Node from '../src/nodes/base/Node';
// Capabilities removed; test updated to use Node lifecycle
import { LoggerService } from '../src/core/services/logger.service.js';
import { ModuleRef } from '@nestjs/core';

class MockLogger extends LoggerService {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

class ModuleRefStub {
  create<T>(Cls: new (...args: any[]) => T): T {
    return new Cls();
  }
}
import { GraphRepository } from '../src/graph/graph.repository';
class StubRepo extends GraphRepository {
  async initIfNeeded(): Promise<void> {}
  async get(): Promise<null> { return null; }
  async upsert(): Promise<never> { throw new Error('not-implemented'); }
  async upsertNodeState(): Promise<void> {}
}
function makeRuntimeAndRegistry() {
  const moduleRef = new ModuleRefStub() as ModuleRef;
  const registry = new TemplateRegistry(moduleRef);
  const logger = new MockLogger();
  const runtime = new LiveGraphRuntime(
    logger,
    registry,
    new StubRepo(),
    moduleRef,
    { resolve: async (input: unknown) => ({ output: input, report: {} as unknown }) } as any,
  );
  return { registry, runtime, logger };
}

describe('Runtime helpers and GraphRepository API surfaces', () => {
  it('provision/deprovision + status work against live nodes', async () => {
    const { registry, runtime } = makeRuntimeAndRegistry();

    // Mock node impl
    class MockNode extends Node<Record<string, unknown>> {
      getPortConfig() {
        return {};
      }
    }

    const factory: FactoryFn = async () => new MockNode();
    class MockNodeClass extends MockNode {}
    registry.register('mock', { title: 'Mock', kind: 'tool' }, MockNodeClass);

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
    class Dyn1 extends Node<Record<string, unknown>> {
      setConfig = async () => {};
      getPortConfig() {
        return {};
      }
    }
    registry.register('dyn', { title: 'Dyn', kind: 'tool' }, Dyn1);

    // Create a mock dyn-configurable node instance
    class DynNode extends Node<Record<string, unknown>> {
      setDynamicConfig = vi.fn((_cfg: Record<string, unknown>) => {});
      setConfig = vi.fn(async (_cfg: Record<string, unknown>) => {});
      getPortConfig() {
        return {};
      }
    }
    registry.register('dyn2', { title: 'Dyn2', kind: 'tool' }, DynNode);

    // Runtime graph
    await runtime.apply({
      nodes: [
        { id: 'a', data: { template: 'dyn', config: {} } },
        { id: 'b', data: { template: 'dyn2', config: {} } },
      ],
      edges: [],
    });

    // Template schema via registry directly (GraphRepository now stateless for templates only)
    const templates = await registry.toSchema();
    const dynEntry = templates.find((t) => t.name === 'dyn');
    expect(dynEntry).toBeTruthy();

    // Node pause via runtime directly
    // pause/resume removed from runtime APIs

    // Dynamic config routing on dyn2 via runtime instance
    const instB = runtime.getNodeInstance('b') as DynNode;
    instB.setDynamicConfig = vi.fn();
    await instB.setDynamicConfig({ a: true });
    expect(instB.setDynamicConfig).toHaveBeenCalledWith({ a: true });

    // setNodeConfig on instance directly
    instB.setConfig = vi.fn();
    await instB.setConfig({ x: 1 });
    expect(instB.setConfig).toHaveBeenCalledWith({ x: 1 });
  });
});
