import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService, type ContainerOpts } from '../src/infra/container/container.service';
import { ContainerHandle } from '../src/infra/container/container.handle';
import { ConfigService } from '../src/core/services/config.service.js';
import { EnvService } from '../src/env/env.service';
import { VaultService } from '../src/vault/vault.service';
import { NodeStateService } from '../src/graph/nodeState.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { ModuleRef } from '@nestjs/core';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { GraphRepository } from '../src/graph/graph.repository';
import type { GraphDefinition } from '../src/shared/types/graph.types';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

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


describe('Graph MCP integration', () => {
  it('constructs graph with mcpServer template without error (deferred start)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ContainerService, useClass: StubContainerService },
        { provide: ConfigService, useClass: StubConfigService },
        EnvService,
        { provide: VaultService, useClass: StubVaultService },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        { provide: NcpsKeyService, useValue: { getKeysForInjection: () => [] } },
        { provide: ContainerRegistry, useValue: { updateLastUsed: async () => {}, registerStart: async () => {}, markStopped: async () => {} } },
        { provide: NodeStateService, useValue: { upsertNodeState: async () => {}, getSnapshot: () => undefined } },
        TemplateRegistry,
        LiveGraphRuntime,
        GraphRepository,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => ({ messageIds: [] }),
            completeRun: async () => {},
            ensureThreadModel: async (_threadId: string, model: string) => model,
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
    class GraphRepoStub implements Pick<GraphRepository, 'initIfNeeded' | 'get' | 'upsert' | 'upsertNodeState'> {
      async initIfNeeded(): Promise<void> {}
      async get(): Promise<null> { return null; }
      async upsert(): Promise<never> { throw new Error('not-implemented'); }
      async upsertNodeState(): Promise<void> {}
    }

    const resolver = { resolve: async (input: unknown) => ({ output: input, report: {} as unknown }) };
    const runtime = new LiveGraphRuntime(logger, templateRegistry, new GraphRepoStub(), moduleRef, resolver as any);

    const graph: GraphDefinition = {
      nodes: [
        { id: 'container', data: { template: 'workspace' } },
        { id: 'agent', data: { template: 'agent' } },
        { id: 'mcp', data: { template: 'mcpServer', config: { namespace: 'x', command: 'echo "mock" && sleep 1' } } },
      ],
      edges: [
        { source: 'container', sourceHandle: '$self', target: 'mcp', targetHandle: 'workspace' },
        { source: 'agent', sourceHandle: 'mcp', target: 'mcp', targetHandle: '$self' },
      ],
    };

    const result = await runtime.apply(graph);
    expect(result.addedNodes).toContain('mcp');
  }, 60000);
});
