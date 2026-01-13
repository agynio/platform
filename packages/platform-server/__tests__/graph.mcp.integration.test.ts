import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { buildTemplateRegistry } from '../src/templates';
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
import { ReferenceResolverService } from '../src/utils/reference-resolver.service';
import {
  WorkspaceProvider,
  type WorkspaceProviderCapabilities,
  type ExecRequest,
  type WorkspaceKey,
  type WorkspaceSpec,
  type DestroyWorkspaceOptions,
  type ExecResult,
} from '../src/workspace/providers/workspace.provider';
import type {
  WorkspaceStdioSession,
  WorkspaceStdioSessionRequest,
  WorkspaceTerminalSession,
  WorkspaceTerminalSessionRequest,
  WorkspaceLogsSession,
  WorkspaceLogsRequest,
} from '../src/workspace/runtime/workspace.runtime.provider';
import { PassThrough } from 'node:stream';

class StubContainerService extends ContainerService {
  constructor(registry: ContainerRegistry) {
    super(registry);
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

class StubWorkspaceProvider extends WorkspaceProvider {
  capabilities(): WorkspaceProviderCapabilities {
    return {
      persistentVolume: true,
      network: true,
      networkAliases: true,
      dockerInDocker: true,
      stdioSession: true,
      terminalSession: true,
      logsSession: true,
    };
  }

  async ensureWorkspace(_key: WorkspaceKey, _spec: WorkspaceSpec) {
    return { workspaceId: 'workspace', created: true, providerType: 'docker', status: 'running' as const };
  }

  async exec(_workspaceId: string, _request: ExecRequest): Promise<ExecResult> {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  async openStdioSession(
    _workspaceId: string,
    _request: WorkspaceStdioSessionRequest,
  ): Promise<WorkspaceStdioSession> {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    setImmediate(() => stdout.end());
    return { stdin, stdout, stderr: undefined, close: async () => ({ exitCode: 0, stdout: '', stderr: '' }) };
  }

  async openTerminalSession(
    _workspaceId: string,
    _request: WorkspaceTerminalSessionRequest,
  ): Promise<WorkspaceTerminalSession> {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const sessionId = 'exec';
    setImmediate(() => stdout.end());
    return {
      sessionId,
      execId: sessionId,
      stdin,
      stdout,
      stderr: undefined,
      resize: async () => undefined,
      close: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    };
  }

  async openLogsSession(
    _workspaceId: string,
    _request: WorkspaceLogsRequest,
  ): Promise<WorkspaceLogsSession> {
    const stream = new PassThrough();
    setImmediate(() => stream.end());
    return { stream, close: async () => { stream.end(); } };
  }

  async destroyWorkspace(_workspaceId: string, _options?: DestroyWorkspaceOptions): Promise<void> {
    return;
  }

  async touchWorkspace(_workspaceId: string): Promise<void> {
    return;
  }

  async putArchive(): Promise<void> {
    return;
  }
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
      litellmBaseUrl: 'http://localhost:4000',
      litellmMasterKey: 'sk-test',
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
  async init(): Promise<void> {}
  async getLLM(): Promise<{ call: (messages: unknown) => Promise<{ text: string; output: unknown[] }> }> {
    return { call: async () => ({ text: 'ok', output: [] }) };
  }
  async teardown(): Promise<void> {}
}


describe('Graph MCP integration', () => {
  it('constructs graph with mcpServer template without error (deferred start)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        { provide: ContainerService, useClass: StubContainerService },
        { provide: WorkspaceProvider, useClass: StubWorkspaceProvider },
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

    const moduleRef = module.get(ModuleRef);

    const templateRegistry = buildTemplateRegistry({ moduleRef });
    class GraphRepoStub implements Pick<GraphRepository, 'initIfNeeded' | 'get' | 'upsert' | 'upsertNodeState'> {
      async initIfNeeded(): Promise<void> {}
      async get(): Promise<null> { return null; }
      async upsert(): Promise<never> { throw new Error('not-implemented'); }
      async upsertNodeState(): Promise<void> {}
    }

    const resolver = { resolve: async (input: unknown) => ({ output: input, report: {} as unknown }) };
    const runtime = new LiveGraphRuntime(templateRegistry, new GraphRepoStub(), moduleRef, resolver as any);

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
