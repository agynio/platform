import { PassThrough } from 'node:stream';
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { buildTemplateRegistry } from '../src/templates';
import { ContainerHandle } from '../src/infra/container/container.handle';
import type { ContainerOpts } from '../src/infra/container/dockerRunner.types';
import { DOCKER_CLIENT, type DockerClient } from '../src/infra/container/dockerClient.token';
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
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import type { GraphDefinition, PersistedGraph } from '../src/shared/types/graph.types';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { ReferenceResolverService } from '../src/utils/reference-resolver.service';
import { WorkspaceProvider } from '../src/workspace/providers/workspace.provider';
import { WorkspaceProviderStub } from './helpers/workspace-provider.stub';

const createDockerClientStub = (): DockerClient => {
  const stub: DockerClient = {
    touchLastUsed: async () => undefined,
    ensureImage: async () => undefined,
    start: async (_opts?: ContainerOpts) => new ContainerHandle(stub, 'cid'),
    execContainer: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    openInteractiveExec: async () => ({
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      close: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      execId: 'exec-1',
      terminateProcessGroup: async () => undefined,
    }),
    streamContainerLogs: async () => ({ stream: new PassThrough(), close: async () => undefined }),
    resizeExec: async () => undefined,
    stopContainer: async () => undefined,
    removeContainer: async () => undefined,
    getContainerLabels: async () => undefined,
    getContainerNetworks: async () => [],
    findContainersByLabels: async () => [],
    listContainersByVolume: async () => [],
    removeVolume: async () => undefined,
    findContainerByLabels: async () => undefined,
    putArchive: async () => undefined,
    inspectContainer: async () => ({ Id: 'cid' }),
    getEventsStream: async () => new PassThrough(),
    checkConnectivity: async () => ({ status: 'ok' }),
  };
  return stub;
};
class StubConfigService extends ConfigService {
  constructor() {
    super();
    this.init({
      githubAppId: 'test',
      githubAppPrivateKey: 'test',
      githubInstallationId: 'test',
      openaiApiKey: 'test',
      llmProvider: 'openai',
      litellmBaseUrl: 'http://localhost:4000',
      litellmMasterKey: 'sk-test',
      openaiBaseUrl: undefined,
      githubToken: 'test',
      graphRepoPath: './data/graph',
      graphBranch: 'main',
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
  async init(): Promise<void> {}
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
  async teardown(): Promise<void> {}
}

describe('Boot respects MCP enabledTools from persisted state', () => {
  it('agent registers only enabled MCP tools on load', async () => {
    const module = await Test.createTestingModule({
      providers: [
        { provide: DOCKER_CLIENT, useValue: createDockerClientStub() },
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
        { provide: NcpsKeyService, useValue: { getKeysForInjection: () => [] } },
        { provide: ContainerRegistry, useValue: { updateLastUsed: async () => {}, registerStart: async () => {}, markStopped: async () => {} } },
        { provide: WorkspaceProvider, useClass: WorkspaceProviderStub },
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

    const moduleRef = module.get(ModuleRef);

    const templateRegistry = buildTemplateRegistry({ moduleRef });

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
    const runtime = new LiveGraphRuntime(
      templateRegistry,
      new GraphRepoStub() as unknown as GraphRepository,
      moduleRef,
      resolver as any,
    );
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
