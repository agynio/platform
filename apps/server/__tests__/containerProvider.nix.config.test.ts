import { describe, it, expect } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { buildTemplateRegistry } from '../src/templates';
import type { LoggerService } from '../src/services/logger.service';
import type { ContainerService } from '../src/services/container.service';
import type { ConfigService } from '../src/services/config.service';
import type { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';
import type { GraphDefinition } from '../src/graph/types';

// Minimal typed stubs
class StubLogger implements LoggerService {
  info(message: string, ..._args: unknown[]) {}
  debug(message: string, ..._args: unknown[]) {}
  error(message: string, ..._args: unknown[]) {}
}
class StubMongo implements MongoService {
  // Only getDb is accessed by buildTemplateRegistry
  getDb(): any { return {}; }
} // eslint-disable-line @typescript-eslint/no-explicit-any

function makeRuntime() {
  const logger = new StubLogger();
  const deps = {
    logger,
    containerService: {} as unknown as ContainerService,
    configService: {} as unknown as ConfigService,
    checkpointerService: {} as unknown as CheckpointerService,
    mongoService: new StubMongo(),
  };
  const registry = buildTemplateRegistry(deps);
  const runtime = new LiveGraphRuntime(logger, registry);
  return { registry, runtime };
}

describe('containerProvider nix config acceptance', () => {
  it('applies config with nix.packages without CONFIG_APPLY_ERROR and preserves nix in live config', async () => {
    const { runtime } = makeRuntime();
    const graph: GraphDefinition = {
      nodes: [
        {
          id: 'ws',
          data: {
            template: 'containerProvider',
            config: {
              image: 'alpine:3',
              nix: { packages: [{ attr: 'htop', pname: 'htop', channel: 'nixpkgs' }] },
            },
          },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(graph);
    expect(res.errors.length).toBe(0);
    const live = runtime.getNodes().find((n) => n.id === 'ws');
    expect(live?.config && (live.config as any).nix?.packages?.length).toBe(1);
    expect((live?.config as any).nix.packages[0]).toEqual({ attr: 'htop', pname: 'htop', channel: 'nixpkgs' });
  });

  it('defaults nix.packages to [] when nix present without packages and strips unknown top-level keys', async () => {
    const { runtime } = makeRuntime();
    const graph: GraphDefinition = {
      nodes: [
        {
          id: 'ws2',
          data: {
            template: 'containerProvider',
            config: {
              image: 'alpine:3',
              nix: {},
              bogusTopLevelKey: 'should_be_stripped',
            },
          },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(graph);
    expect(res.errors.length).toBe(0);
    const live = runtime.getNodes().find((n) => n.id === 'ws2');
    expect((live?.config as any).nix).toBeTruthy();
    // Live config may omit explicit defaults; instance config must include defaults from schema
    // Instance type is Configurable; access via known class field (cfg)
    const inst = runtime.getNodeInstance<unknown>('ws2') as { cfg?: { nix?: { packages?: unknown[] } } } | undefined;
    expect(inst?.cfg?.nix?.packages).toEqual([]);
    expect((live?.config as any).bogusTopLevelKey).toBeUndefined();
  });

  it('rejects nested unknown keys under nix.packages items', async () => {
    const { runtime } = makeRuntime();
    const graph: GraphDefinition = {
      nodes: [
        {
          id: 'ws3',
          data: {
            template: 'containerProvider',
            config: {
              image: 'alpine:3',
              nix: { packages: [{ attr: 'htop', extra: 'x' }] },
            },
          },
        },
      ],
      edges: [],
    };
    await expect(runtime.apply(graph)).rejects.toMatchObject({
      name: 'GraphError',
      code: 'NODE_INIT_ERROR',
      nodeId: 'ws3',
    });
  });
});
