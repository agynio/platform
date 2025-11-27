import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService, type ContainerOpts } from '../src/infra/container/container.service';
import { ContainerHandle } from '../src/infra/container/container.handle';
import { ConfigService } from '../src/core/services/config.service.js';
import { EnvService } from '../src/env/env.service';
import { ReferenceResolverService } from '../src/utils/reference-resolver.service';
import { VaultService } from '../src/vault/vault.service';
import { NodeStateService } from '../src/graph/nodeState.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { ModuleRef } from '@nestjs/core';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { GraphRepository } from '../src/graph/graph.repository';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import type { GraphDefinition, PersistedGraph } from '../src/shared/types/graph.types';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { ReferenceResolverService } from '../src/utils/reference-resolver.service';

class StubContainerService extends ContainerService {
  constructor(registry: ContainerRegistry, logger: LoggerService) {
    super(registry, logger);
  }
  override async start(_opts?: ContainerOpts): Promise<ContainerHandle> {
    return new ContainerHandle(this, 'cid');
  }
  override async execContainer(
    _id: string,
    _command: string[] | string,
    _options?: {
      workdir?: string;
      env?: Record<string, string> | string[];
      timeoutMs?: number;
      idleTimeoutMs?: number;
      tty?: boolean;
      killOnTimeout?: boolean;
      signal?: AbortSignal;
      logToPid1?: boolean;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return { stdout: '', stderr: '', exitCode: 0 };
  }
  override async findContainerByLabels(
    _labels: Record<string, string>,
    _opts?: { all?: boolean },
  ): Promise<ContainerHandle | undefined> {
    return undefined;
  }
  override async findContainersByLabels(
    _labels: Record<string, string>,
    _opts?: { all?: boolean },
  ): Promise<ContainerHandle[]> {
    return [];
  }
  override async getContainerLabels(_id: string): Promise<Record<string, string> | undefined> {
    return undefined;
  }
  override async touchLastUsed(_id: string): Promise<void> {}
  override async stopContainer(_id: string, _timeoutSec = 10): Promise<void> {}
  override async removeContainer(_id: string, _force = false): Promise<void> {}
  override async putArchive(_id: string, _data: Buffer | NodeJS.ReadableStream, _options: { path: string }): Promise<void> {}
}
class StubConfigService extends ConfigService {
  constructor() {
    super();
    this.init({
      githubAppId: 'test',
      githubAppPrivateKey: 'test',
      githubInstallationId: 'test',
      openaiApiKey: 'test',
      llmProvider: 'openai',
      litellmBaseUrl: undefined,
      litellmMasterKey: undefined,
      openaiBaseUrl: undefined,
      githubToken: 'test',
      graphRepoPath: './data/graph',
      graphBranch: 'graph-state',
      graphAuthorName: undefined,
      graphAuthorEmail: undefined,
      graphLockTimeoutMs: 5000,
      vaultEnabled: false,
      vaultAddr: undefined,
      vaultToken: undefined,
      dockerMirrorUrl: 'http://registry-mirror:5000',
      nixAllowedChannels: ['nixpkgs-unstable', 'nixos-24.11'],
      nixHttpTimeoutMs: 5000,
      nixCacheTtlMs: 300000,
      nixCacheMax: 500,
      mcpToolsStaleTimeoutMs: 0,
      ncpsEnabled: false,
      ncpsUrl: 'http://ncps:8501',
      ncpsUrlServer: 'http://ncps:8501',
      ncpsUrlContainer: 'http://ncps:8501',
      ncpsPubkeyPath: '/pubkey',
      ncpsFetchTimeoutMs: 3000,
      ncpsRefreshIntervalMs: 600000,
      ncpsStartupMaxRetries: 8,
      ncpsRetryBackoffMs: 500,
      ncpsRetryBackoffFactor: 2,
      ncpsAllowStartWithoutKey: true,
      ncpsCaBundle: undefined,
      ncpsRotationGraceMinutes: 0,
      ncpsAuthHeader: undefined,
      ncpsAuthToken: undefined,
      agentsDatabaseUrl: 'postgres://localhost:5432/agents',
      corsOrigins: [],
    });
  }
}
class StubVaultService extends VaultService {
  override async getSecret(): Promise<string | undefined> {
    return undefined;
  }
}
class StubLLMProvisioner extends LLMProvisioner {
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
}

describe('Boot respects MCP enabledTools from persisted state', () => {
  it('agent registers only enabled MCP tools on load', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ContainerService, useClass: StubContainerService },
        { provide: ConfigService, useClass: StubConfigService },
        EnvService,
        {
          provide: ReferenceResolverService,
          useValue: {
            resolve: async (input: unknown) => ({ output: input, report: {} as unknown }),
          },
        },
        { provide: VaultService, useClass: StubVaultService },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        {
          provide: ReferenceResolverService,
          useValue: { resolve: async <T>(input: T) => ({ output: input, report: {} as Record<string, never> }) },
        },
        { provide: NcpsKeyService, useValue: { getKeysForInjection: () => [] } },
        { provide: ContainerRegistry, useValue: { updateLastUsed: async () => {}, registerStart: async () => {}, markStopped: async () => {} } },
        { provide: GraphSocketGateway, useValue: { emitNodeState: (_id: string, _state: Record<string, unknown>) => {} } },
        NodeStateService,
        TemplateRegistry,
        LiveGraphRuntime,
        GraphRepository,
        { provide: EventsBusService, useValue: createEventsBusStub() as unknown as EventsBusService },
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRun: async () => ({ runId: 't' }),
            recordInjected: async () => ({ messageIds: [] }),
            completeRun: async () => {},
          },
        },
        RunSignalsRegistry,
      ],
    }).compile();

    const logger = module.get(LoggerService);
    const containerService = module.get(ContainerService);
    const configService = module.get(ConfigService);
    const provisioner = module.get(LLMProvisioner);
    const moduleRef = module.get(ModuleRef);

    const templateRegistry = buildTemplateRegistry({ logger, containerService, configService, provisioner, moduleRef });

    const nowIso = new Date().toISOString();
    const persisted: PersistedGraph = {
      name: 'main',
      version: 1,
      updatedAt: nowIso,
      nodes: [
        { id: 'container', template: 'workspace' },
        { id: 'agent', template: 'agent' },
        {
          id: 'mcp',
          template: 'mcpServer',
          config: { namespace: 'ns', command: 'echo "mock"' },
          state: {
            mcp: {
              tools: [
                { name: 'a', description: 'A', inputSchema: { type: 'object' } },
                { name: 'b', description: 'B', inputSchema: { type: 'object' } },
              ],
              toolsUpdatedAt: Date.now(),
              enabledTools: ['a'],
            },
          },
        },
      ],
      edges: [
        { source: 'container', sourceHandle: '$self', target: 'mcp', targetHandle: 'workspace' },
        { source: 'agent', sourceHandle: 'mcp', target: 'mcp', targetHandle: '$self' },
      ],
    };

    class GraphRepoStub implements Pick<GraphRepository, 'initIfNeeded' | 'get' | 'upsert' | 'upsertNodeState'> {
      async initIfNeeded(): Promise<void> {}
      async get(_name: string): Promise<PersistedGraph | null> { return persisted; }
      async upsert(): Promise<never> { throw new Error('not-implemented'); }
      async upsertNodeState(): Promise<void> {}
    }

    const resolver = { resolve: async (input: unknown) => ({ output: input, report: {} as unknown }) };
    const runtime = new LiveGraphRuntime(logger, templateRegistry, new GraphRepoStub() as unknown as GraphRepository, moduleRef, resolver as any);
    const loaded = await runtime.load();
    expect(loaded.applied).toBe(true);

    // Find agent instance and inspect registered tools
    const agentLive = runtime.getNodes().find((n) => n.template === 'agent');
    expect(agentLive).toBeTruthy();
    const agent = agentLive!.instance as any;
    const names = Array.from(agent.tools)?.map((t: any) => t.name) ?? [];
    expect(names).toContain('ns_a');
    expect(names).not.toContain('ns_b');
  });
});
