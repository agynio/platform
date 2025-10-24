import { describe, it, expect } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { FactoryFn } from '../src/graph/types';
import type { GraphDefinition } from '../src/graph/types';
import { LoggerService } from '../src/core/services/logger.service.js';

class WiringProbeAgent {
  public sawRunsService: boolean;
  public sawRuntime: boolean;
  constructor() {
    // Read globals at construction time to simulate real agent init()
    this.sawRunsService = !!globalThis.__agentRunsService;
    this.sawRuntime = !!globalThis.liveGraphRuntime;
  }
  async setConfig(_cfg: Record<string, unknown>) {}
}

describe('Server bootstrap wiring timing', () => {
  it('sets globals before applying persisted graph so factories see them', async () => {
    const registry = new TemplateRegistry();
    const logger = new LoggerService();
    class StubRepo extends GraphRepository { async initIfNeeded(): Promise<void> {} async get(): Promise<any> { return null; } async upsert(): Promise<any> { throw new Error('not-implemented'); } async upsertNodeState(): Promise<void> {} }
    const runtime = new LiveGraphRuntime(logger, registry, new StubRepo());
    // Register a factory that captures globals at instantiation time
    const factory: FactoryFn = async () => new WiringProbeAgent();
    registry.register('wiringProbe', { title: 'Probe', kind: 'agent' }, factory as any);

    // Emulate server code: set globals BEFORE runtime.apply
    declare global {
      // Limit test-global shape to what we assert on
       
      var liveGraphRuntime: LiveGraphRuntime | undefined;
       
      var __agentRunsService: { ensureIndexes: () => Promise<void> } | undefined;
    }
    globalThis.liveGraphRuntime = runtime;
    globalThis.__agentRunsService = { ensureIndexes: async () => {} };

    const testGraph: GraphDefinition = {
      nodes: [{ id: 'agent1', data: { template: 'wiringProbe', config: {} } }],
      edges: [],
    };
    await runtime.apply(testGraph);
    const inst = runtime.getNodeInstance<WiringProbeAgent>('agent1')!;
    expect(inst.sawRuntime).toBe(true);
    expect(inst.sawRunsService).toBe(true);
  });
});
