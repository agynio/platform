import { Global, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

import { ConfigService, configSchema } from '../src/core/services/config.service';
import { CoreModule } from '../src/core/core.module';
import { EnvModule } from '../src/env/env.module';
import { EventsModule } from '../src/events/events.module';
import { GraphCoreModule } from '../src/graph-core/graph-core.module';
import { NodesModule } from '../src/nodes/nodes.module';
import { GraphRepository } from '../src/graph/graph.repository';
import { FsGraphRepository } from '../src/graph/fsGraph.repository';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { ShellCommandNode } from '../src/nodes/tools/shell_command/shell_command.node';
import { RunEventsService, type ToolOutputChunkPayload, type ToolOutputTerminalPayload } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { WorkspaceProvider } from '../src/workspace/providers/workspace.provider';
import { WorkspaceNode } from '../src/nodes/workspace/workspace.node';
import type { WorkspaceHandle } from '../src/workspace/workspace.handle';
import type { ArchiveService } from '../src/infra/archive/archive.service';
import type { EnvService } from '../src/env/env.service';
import { ArchiveService as ArchiveServiceToken } from '../src/infra/archive/archive.service';
import { EnvService as EnvServiceToken } from '../src/env/env.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { DOCKER_CLIENT } from '../src/infra/container/dockerClient.token';
import type { DockerClient } from '../src/infra/container/dockerClient.token';
import { ContainerCleanupService } from '../src/infra/container/containerCleanup.job';
import { VolumeGcService } from '../src/infra/container/volumeGc.job';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { ContainerEventProcessor } from '../src/infra/container/containerEvent.processor';
import { DockerWorkspaceEventsWatcher } from '../src/infra/container/containerEvent.watcher';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { DockerRunnerConnectivityProbe } from '../src/infra/container/dockerRunnerConnectivity.probe';
import { ContainerAdminService } from '../src/infra/container/containerAdmin.service';
import { TerminalSessionsService } from '../src/infra/container/terminal.sessions.service';
import { ContainerTerminalGateway } from '../src/infra/container/terminal.gateway';
import { GithubService } from '../src/infra/github/github.client';
import { PRService } from '../src/infra/github/pr.usecase';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { ThreadTransportService } from '../src/messaging/threadTransport.service';
import { PostgresMemoryEntitiesRepository } from '../src/nodes/memory/memory.repository';
import { MemoryService } from '../src/nodes/memory/memory.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { createEventsBusStub, createRunEventsStub } from '../__tests__/helpers/runEvents.stub';

export const USER_GRAPH_NODE_ID = 'cc8d56d8-ee2d-4303-8341-ace54c4f3fd7';
export const USER_NODE_YAML = [
  `id: ${USER_GRAPH_NODE_ID}`,
  'template: shellTool',
  'config:',
  '  env: []',
  '  executionTimeoutMs: 300000',
  '  idleTimeoutMs: 60000',
  '  workdir: /workspace',
  '  outputLimitChars: 50000',
  'position:',
  '  x: 1151.3304377147065',
  '  y: -718.0877350439077',
  '',
].join('\n');

export const REQUIRED_CONFIG = {
  llmProvider: 'openai' as const,
  openaiApiKey: 'sk-openai-test',
  openaiBaseUrl: 'https://api.openai.example/v1',
  litellmBaseUrl: 'http://127.0.0.1:4000',
  litellmMasterKey: 'sk-litellm-test',
  dockerRunnerBaseUrl: 'http://127.0.0.1:3000',
  dockerRunnerSharedSecret: 'runner-shared-secret',
  agentsDatabaseUrl: 'postgresql://postgres:postgres@localhost:5432/agents_test',
};

@Global()
@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: GraphRepository,
      useFactory: async (configService: ConfigService, moduleRef: ModuleRef) => {
        const registry = await moduleRef.resolve(TemplateRegistry, undefined, { strict: false });
        const repo = new FsGraphRepository(configService, registry);
        await repo.initIfNeeded();
        return repo;
      },
      inject: [ConfigService, ModuleRef],
    },
    {
      provide: AgentsPersistenceService,
      useValue: {
        getAgentById: vi.fn(),
        upsertAgent: vi.fn(),
        linkAgentToCall: vi.fn(),
        unlinkAgentsFromThread: vi.fn(),
        findAgentsForThread: vi.fn(async () => []),
      } satisfies Partial<AgentsPersistenceService> as AgentsPersistenceService,
    },
    {
      provide: CallAgentLinkingService,
      useValue: {
        linkAgentNodeToCall: vi.fn(),
        unlinkAgentNodeFromCall: vi.fn(),
      } satisfies Partial<CallAgentLinkingService> as CallAgentLinkingService,
    },
  ],
  exports: [GraphRepository, AgentsPersistenceService, CallAgentLinkingService],
})
export class ShellCommandTestGraphModule {}

export type ExecImplementation = (
  command: string | string[],
  options?: {
    onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
  },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

class ScriptedWorkspaceHandle implements Pick<WorkspaceHandle, 'exec' | 'putArchive'> {
  public lastArchive?: { data: Buffer; path: string };
  public lastCommand?: string;

  constructor(private readonly impl: ExecImplementation) {}

  async exec(
    command: string | string[],
    options?: {
      onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const normalized = Array.isArray(command) ? command.join(' ') : command;
    this.lastCommand = normalized;
    return this.impl(normalized, options);
  }

  async putArchive(data: Buffer | NodeJS.ReadableStream, options?: { path?: string }): Promise<void> {
    const targetPath = options?.path ?? '';
    if (Buffer.isBuffer(data)) {
      this.lastArchive = { data, path: targetPath };
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    this.lastArchive = { data: Buffer.concat(chunks), path: targetPath };
  }
}

export type ShellCommandTestHarness = {
  testingModule: TestingModule;
  runtime: LiveGraphRuntime;
  shellNode: ShellCommandNode;
  tool: ShellCommandNode['getTool'] extends () => infer T ? T : never;
  runEvents: RunEventsService;
  eventsBus: EventsBusService;
  appendToolOutputChunk: ReturnType<typeof vi.fn>;
  finalizeToolOutputTerminal: ReturnType<typeof vi.fn>;
  archiveStub: Pick<ArchiveService, 'createSingleFileTar'>;
  envStub: Pick<EnvService, 'resolveProviderEnv'>;
  workspaceProviderStub: WorkspaceProvider;
  fakeHandle: ScriptedWorkspaceHandle;
  cleanup: () => Promise<void>;
  tempGraphRoot: string;
};

export async function createShellCommandTestHarness(options: {
  execImplementation: ExecImplementation;
  nodeYaml?: string;
}): Promise<ShellCommandTestHarness> {
  const tempGraphRoot = await mkdtemp(path.join(os.tmpdir(), 'shell-yaml-graph-'));
  await mkdir(path.join(tempGraphRoot, 'nodes'), { recursive: true });
  await mkdir(path.join(tempGraphRoot, 'edges'), { recursive: true });

  const nodeYaml = options.nodeYaml ?? USER_NODE_YAML;
  await writeFile(path.join(tempGraphRoot, 'nodes', `${USER_GRAPH_NODE_ID}.yaml`), nodeYaml, 'utf8');

  const config = configSchema.parse({
    ...REQUIRED_CONFIG,
    graphRepoPath: tempGraphRoot,
  });

  ConfigService.clearInstanceForTest();
  ConfigService.register(new ConfigService().init(config));

  const prismaStub = {
    getClient: () => ({
      container: { findUnique: vi.fn(async () => null) },
      containerEvent: { findFirst: vi.fn(async () => null) },
    }),
  } as unknown as PrismaService;

  const archiveStub = {
    createSingleFileTar: vi.fn(async (_filename: string, content: string, mode: number) => {
      return Buffer.from(`tar-${content.length}-${mode}`);
    }),
  } satisfies Pick<ArchiveService, 'createSingleFileTar'>;

  const envStub = {
    resolveProviderEnv: vi.fn(async () => ({})),
  } satisfies Pick<EnvService, 'resolveProviderEnv'>;

  const workspaceProviderStub: WorkspaceProvider = {
    capabilities: vi.fn(() => ({
      persistentVolume: false,
      network: false,
      networkAliases: false,
      dockerInDocker: false,
      stdioSession: false,
      terminalSession: false,
      logsSession: false,
    })),
    ensureWorkspace: vi.fn(async () => ({
      workspaceId: 'workspace-stub',
      created: false,
      providerType: 'docker',
      status: 'running',
    })),
    exec: vi.fn(),
    openStdioSession: vi.fn(),
    openTerminalSession: vi.fn(),
    openLogsSession: vi.fn(),
    destroyWorkspace: vi.fn(),
    putArchive: vi.fn(),
    touchWorkspace: vi.fn(),
  } as unknown as WorkspaceProvider;

  const dockerClientStub = {} as DockerClient;

  const baseRunEvents = createRunEventsStub();
  const finalizeToolOutputTerminal = vi.fn(async (payload: ToolOutputTerminalPayload) => payload);
  const appendToolOutputChunk = vi.fn(async (payload: ToolOutputChunkPayload) => payload);
  const runEvents = {
    ...baseRunEvents,
    appendToolOutputChunk,
    finalizeToolOutputTerminal,
  } as unknown as RunEventsService;

  const eventsBus = {
    ...createEventsBusStub(),
    emitToolOutputChunk: vi.fn(),
    emitToolOutputTerminal: vi.fn(),
  } as unknown as EventsBusService;

  const builder = Test.createTestingModule({
    imports: [CoreModule, EnvModule, EventsModule, GraphCoreModule, NodesModule, ShellCommandTestGraphModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaStub)
    .overrideProvider(ArchiveServiceToken)
    .useValue(archiveStub)
    .overrideProvider(EnvServiceToken)
    .useValue(envStub)
    .overrideProvider(WorkspaceProvider)
    .useValue(workspaceProviderStub)
    .overrideProvider(ContainerRegistry)
    .useValue({ ensureIndexes: vi.fn(), getContainer: vi.fn() })
    .overrideProvider(DOCKER_CLIENT)
    .useValue(dockerClientStub)
    .overrideProvider(ContainerCleanupService)
    .useValue({})
    .overrideProvider(VolumeGcService)
    .useValue({})
    .overrideProvider(ContainerThreadTerminationService)
    .useValue({})
    .overrideProvider(ContainerEventProcessor)
    .useValue({})
    .overrideProvider(DockerWorkspaceEventsWatcher)
    .useValue({})
    .overrideProvider(NcpsKeyService)
    .useValue({})
    .overrideProvider(DockerRunnerConnectivityProbe)
    .useValue({})
    .overrideProvider(ContainerAdminService)
    .useValue({})
    .overrideProvider(TerminalSessionsService)
    .useValue({})
    .overrideProvider(ContainerTerminalGateway)
    .useValue({})
    .overrideProvider(GithubService)
    .useValue({})
    .overrideProvider(PRService)
    .useValue({})
    .overrideProvider(SlackAdapter)
    .useValue({})
    .overrideProvider(ThreadTransportService)
    .useValue({})
    .overrideProvider(PostgresMemoryEntitiesRepository)
    .useValue({})
    .overrideProvider(MemoryService)
    .useValue({})
    .overrideProvider(RunEventsService)
    .useValue(runEvents)
    .overrideProvider(EventsBusService)
    .useValue(eventsBus);

  const testingModule = await builder.compile();
  await testingModule.init();

  const runtime = testingModule.get(LiveGraphRuntime);
  const loadResult = await runtime.load();
  if (!loadResult.applied) {
    throw new Error('Expected persisted graph to be applied');
  }

  const liveNode = runtime.getNodeInstance(USER_GRAPH_NODE_ID);
  if (!liveNode) {
    throw new Error('ShellCommand node not found in runtime');
  }
  if (!(liveNode instanceof ShellCommandNode)) {
    throw new Error('Live node is not ShellCommandNode');
  }
  const shellNode = liveNode;

  const fakeHandle = new ScriptedWorkspaceHandle(options.execImplementation);
  const fakeProvider = {
    provide: vi.fn(async () => fakeHandle as unknown as WorkspaceHandle),
  };

  shellNode.setContainerProvider(fakeProvider as unknown as WorkspaceNode);

  const tool = shellNode.getTool();

  const cleanup = async () => {
    await testingModule.close();
    await rm(tempGraphRoot, { recursive: true, force: true });
    ConfigService.clearInstanceForTest();
    vi.restoreAllMocks();
  };

  return {
    testingModule,
    runtime,
    shellNode,
    tool,
    runEvents,
    eventsBus,
    appendToolOutputChunk,
    finalizeToolOutputTerminal,
    archiveStub,
    envStub,
    workspaceProviderStub,
    fakeHandle,
    cleanup,
    tempGraphRoot,
  };
}
