import { describe, it, expect } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { FactoryFn } from '../src/graph/types';
import { LoggerService } from '../src/services/logger.service';

class WiringProbeAgent {
  public sawRunsService: boolean;
  public sawRuntime: boolean;
  constructor() {
    // Read globals at construction time to simulate real agent init()
    this.sawRunsService = !!(globalThis as any).__agentRunsService;
    this.sawRuntime = !!(globalThis as any).liveGraphRuntime;
  }
  async setConfig(_cfg: Record<string, unknown>) {}
}

describe('Server bootstrap wiring timing', () => {
  it('sets globals before applying persisted graph so factories see them', async () => {
    const registry = new TemplateRegistry();
    const logger = new LoggerService();
    const runtime = new LiveGraphRuntime(logger, registry);

    // Register a factory that captures globals at instantiation time
    const factory: FactoryFn = async () => new WiringProbeAgent() as any;
    registry.register('wiringProbe', factory, { sourcePorts: {}, targetPorts: {} }, { title: 'Probe', kind: 'agent' });

    // Emulate server code: set globals BEFORE runtime.apply
    (globalThis as any).liveGraphRuntime = runtime;
    (globalThis as any).__agentRunsService = { ensureIndexes: async () => {} } as any;

    await runtime.apply({ nodes: [{ id: 'agent1', data: { template: 'wiringProbe', config: {} } }], edges: [] } as any);
    const inst = runtime.getNodeInstance<WiringProbeAgent>('agent1')!;
    expect(inst.sawRuntime).toBe(true);
    expect(inst.sawRunsService).toBe(true);
  });
});

