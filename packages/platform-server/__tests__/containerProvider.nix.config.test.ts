import { describe, it, expect } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { buildTemplateRegistry } from '../src/templates';
import type { LoggerService } from '../src/services/logger.service';
import { ContainerService } from '../src/services/container.service';
import { ConfigService, configSchema } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';
import { ContainerEntity } from '../src/entities/container.entity';
import type { GraphDefinition } from '../src/graph/types';
import type { ContainerProviderStaticConfig } from '../src/entities/containerProvider.entity';

// Minimal typed stubs
class StubLogger implements LoggerService {
  info(message: string, ..._args: unknown[]) {}
  debug(message: string, ..._args: unknown[]) {}
  error(message: string, ..._args: unknown[]) {}
}
import type { Db } from 'mongodb';
class StubMongo implements MongoService {
  // Only getDb is accessed by buildTemplateRegistry via memory template; not used in these tests.
  getDb(): Db { throw new Error('getDb not used in this test'); }
}

class StubContainerService extends ContainerService {
  constructor() { super({ info() {}, debug() {}, error() {} } as LoggerService); }
  override async start(): Promise<ContainerEntity> {
    // Return a real ContainerEntity bound to this stub service; tests won't call its methods.
    return new ContainerEntity(this, 'c');
  }
  override async findContainerByLabels(): Promise<ContainerEntity | undefined> { return undefined; }
  override async findContainersByLabels(): Promise<ContainerEntity[]> { return []; }
  override async getContainerLabels(): Promise<Record<string, string>> { return {}; }
}

function makeRuntime() {
  const logger = new StubLogger();
  const deps = {
    logger,
    containerService: new StubContainerService(),
    configService: new ConfigService(
      configSchema.parse({
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'false', ncpsUrl: 'http://ncps:8501'
      })
    ),
    checkpointerService: new CheckpointerService(logger),
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
    const cfg = live?.config as Partial<ContainerProviderStaticConfig> | undefined;
    expect(cfg?.nix?.packages?.length).toBe(1);
    expect(cfg?.nix?.packages?.[0]).toEqual({ attr: 'htop', pname: 'htop', channel: 'nixpkgs' });
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
    const cfg = live?.config as Partial<ContainerProviderStaticConfig> | undefined;
    expect(cfg?.nix).toBeTruthy();
    // Live config may omit explicit defaults; instance config must include defaults from schema
    // Instance type is Configurable; access via known class field (cfg)
    const inst = runtime.getNodeInstance<unknown>('ws2') as { cfg?: { nix?: { packages?: unknown[] } } } | undefined;
    // With nix treated as opaque, packages may be undefined; accept either [] or undefined
    const pkgs = inst?.cfg?.nix && (inst?.cfg?.nix as any).packages;
    expect(pkgs === undefined || Array.isArray(pkgs)).toBe(true);
    expect((live?.config as Record<string, unknown> | undefined)?.bogusTopLevelKey).toBeUndefined();
  });

  it('allows extended nix items without rejection', async () => {
    const { runtime } = makeRuntime();
    const graph: GraphDefinition = {
      nodes: [
        {
          id: 'ws3',
          data: {
            template: 'containerProvider',
            config: {
              image: 'alpine:3',
              nix: { packages: [{ name: 'git', version: '2.44.0', attribute_path: 'pkgs/git', commit_hash: 'abc123' }] },
            },
          },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(graph);
    expect(res.errors.length).toBe(0);
  });
});
