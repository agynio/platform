import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { Global, Module } from '@nestjs/common';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { configSchema, ConfigService } from '../src/core/services/config.service';
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
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { Signal } from '../src/signal';

import { createEventsBusStub, createRunEventsStub } from '../__tests__/helpers/runEvents.stub';
import type { LLMContext, LLMState } from '../src/llm/types';
import { WorkspaceNode } from '../src/nodes/workspace/workspace.node';

import type { ArchiveService } from '../src/infra/archive/archive.service';
import type { EnvService } from '../src/env/env.service';
import type { WorkspaceHandle } from '../src/workspace/workspace.handle';
import { WorkspaceProvider } from '../src/workspace/providers/workspace.provider';
import type { DockerClient } from '../src/infra/container/dockerClient.token';

import { PrismaService } from '../src/core/services/prisma.service';
import { ArchiveService as ArchiveServiceToken } from '../src/infra/archive/archive.service';
import { EnvService as EnvServiceToken } from '../src/env/env.service';
import { RunEventsService } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { DOCKER_CLIENT } from '../src/infra/container/dockerClient.token';
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
class TestGraphRepositoryModule {}

class FakeWorkspaceHandle implements Pick<WorkspaceHandle, 'exec' | 'putArchive'> {
  public lastArchive?: { data: Buffer; path: string };

  async exec(
    _command: string | string[],
    opts?: {
      onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const payload = Buffer.from('X'.repeat(200_000));
    opts?.onOutput?.('stdout', payload);
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  async putArchive(data: Buffer | NodeJS.ReadableStream, options?: { path?: string }): Promise<void> {
    const pathValue = options?.path ?? '';
    if (Buffer.isBuffer(data)) {
      this.lastArchive = { data, path: pathValue };
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    this.lastArchive = { data: Buffer.concat(chunks), path: pathValue };
  }
}

describe('ShellCommandTool YAML config spillover (FsGraphRepository E2E)', () => {
  const requiredConfig = {
    llmProvider: 'openai' as const,
    openaiApiKey: 'sk-openai-test',
    openaiBaseUrl: 'https://api.openai.example/v1',
    litellmBaseUrl: 'http://127.0.0.1:4000',
    litellmMasterKey: 'sk-litellm-test',
    dockerRunnerBaseUrl: 'http://127.0.0.1:3000',
    dockerRunnerSharedSecret: 'runner-shared-secret',
    agentsDatabaseUrl: 'postgresql://postgres:postgres@localhost:5432/agents_test',
  };

  const graphNodeId = 'cc8d56fb-8262-40c9-88b7-27377c6f50ab';
  let tempGraphRoot: string;

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

  afterEach(async () => {
    await rm(tempGraphRoot, { recursive: true, force: true });
    ConfigService.clearInstanceForTest();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    tempGraphRoot = await mkdtemp(path.join(os.tmpdir(), 'shell-yaml-graph-'));
    await mkdir(path.join(tempGraphRoot, 'nodes'), { recursive: true });
    await mkdir(path.join(tempGraphRoot, 'edges'), { recursive: true });

    const config = configSchema.parse({
      ...requiredConfig,
      graphRepoPath: tempGraphRoot,
    });

    ConfigService.clearInstanceForTest();
    ConfigService.register(new ConfigService().init(config));
  });

  it('enforces numeric output limit from persisted YAML graph definition', async () => {
    const builder = Test.createTestingModule({
      imports: [CoreModule, EnvModule, EventsModule, GraphCoreModule, NodesModule, TestGraphRepositoryModule],
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
      .useValue({ start: vi.fn() })
      .overrideProvider(VolumeGcService)
      .useValue({ start: vi.fn() })
      .overrideProvider(ContainerThreadTerminationService)
      .useValue({})
      .overrideProvider(ContainerEventProcessor)
      .useValue({})
      .overrideProvider(DockerWorkspaceEventsWatcher)
      .useValue({ start: vi.fn() })
      .overrideProvider(NcpsKeyService)
      .useValue({ init: vi.fn(), getKeysForInjection: () => [] })
      .overrideProvider(DockerRunnerConnectivityProbe)
      .useValue({ probe: vi.fn() })
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
      .useValue({});

    const baseRunEvents = createRunEventsStub();
    const finalizeToolOutputTerminal = vi.fn<
      Parameters<RunEventsService['finalizeToolOutputTerminal']>,
      ReturnType<RunEventsService['finalizeToolOutputTerminal']>
    >(async (payload) => payload);
    const appendToolOutputChunk = vi.fn<
      Parameters<RunEventsService['appendToolOutputChunk']>,
      ReturnType<RunEventsService['appendToolOutputChunk']>
    >(async (payload) => payload);
    const runEventsStub = {
      ...baseRunEvents,
      appendToolOutputChunk,
      finalizeToolOutputTerminal,
    } as unknown as RunEventsService;

    const eventsBusStub = {
      ...createEventsBusStub(),
      emitToolOutputChunk: vi.fn(),
      emitToolOutputTerminal: vi.fn(),
    } as unknown as EventsBusService;

    builder.overrideProvider(RunEventsService).useValue(runEventsStub);
    builder.overrideProvider(EventsBusService).useValue(eventsBusStub);
    const testingModule = await builder.compile();
    await testingModule.init();

    const nodeYaml = `id: ${graphNodeId}
template: shellTool
config:
  executionTimeoutMs: 300000
  idleTimeoutMs: 60000
  workdir: /workspace
  outputLimitChars: 2048
state:
  provider:
    raw: {}
  config:
    executionTimeoutMs: 300000
    idleTimeoutMs: 60000
    workdir: /workspace
    outputLimitChars: 2048
`;

    await writeFile(path.join(tempGraphRoot, 'nodes', `${graphNodeId}.yaml`), nodeYaml, 'utf8');

    const runtime = testingModule.get(LiveGraphRuntime);
    const loadResult = await runtime.load();
    expect(loadResult.applied).toBe(true);

    const liveNode = runtime.getNodeInstance(graphNodeId);
    expect(liveNode).toBeInstanceOf(ShellCommandNode);
    const shellNode = liveNode as ShellCommandNode;

    const fakeHandle = new FakeWorkspaceHandle();
    const fakeProvider = {
      provide: vi.fn(async () => fakeHandle as unknown as WorkspaceHandle),
    };

    shellNode.setContainerProvider(fakeProvider as unknown as WorkspaceNode);

    const tool = shellNode.getTool();

    const reducer = new CallToolsLLMReducer(runEventsStub, eventsBusStub).init({ tools: [tool] });

    const callMessageSource = {
      type: 'function_call',
      call_id: 'call-shell-yaml',
      name: tool.name,
      arguments: JSON.stringify({ command: 'yes X | head -c 200000' }),
    } satisfies Parameters<typeof ToolCallMessage>[0];

    const callMessage = new ToolCallMessage(callMessageSource);

    const responsePayload = {
      output: [callMessage.toPlain()],
    } satisfies ConstructorParameters<typeof ResponseMessage>[0];

    const response = new ResponseMessage(responsePayload);
    const state: LLMState = {
      messages: [response],
      context: { messageIds: [], memory: [] },
      meta: { lastLLMEventId: 'evt-yaml' },
    };

    const ctx: LLMContext = {
      threadId: 'thread-yaml',
      runId: 'run-yaml',
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => 'agent-node-id' },
    };

    const result = await reducer.invoke(state, ctx);

    const message = result.messages.at(-1) as ToolCallOutputMessage;
    expect(message).toBeInstanceOf(ToolCallOutputMessage);
    expect(message.text).toContain('Full output saved to /tmp/');
    expect(message.text).toContain('Output truncated after 2048 characters.');
    expect(message.text.length).toBeLessThan(5_000);

    expect(finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const [terminalPayload] = finalizeToolOutputTerminal.mock.calls[0] as Parameters<
      RunEventsService['finalizeToolOutputTerminal']
    >;
    expect(terminalPayload.savedPath).toMatch(/^\/tmp\/[0-9a-f-]{36}\.txt$/i);
    expect(terminalPayload.message).toContain('Full output saved to');

    expect(fakeProvider.provide).toHaveBeenCalledOnce();
    expect(fakeHandle.lastArchive?.path).toBe('/tmp');
    expect(fakeHandle.lastArchive?.data).toBeInstanceOf(Buffer);

    await testingModule.close();
  });
});
