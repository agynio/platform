import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { Test, type TestingModule } from '@nestjs/testing';

import { HumanMessage, ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { Response, ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';

import { ConfigService, configSchema } from '../src/core/services/config.service';
import { CoreModule } from '../src/core/core.module';
import { EnvModule } from '../src/env/env.module';
import { EventsModule } from '../src/events/events.module';
import { GraphCoreModule } from '../src/graph-core/graph-core.module';
import { NodesModule } from '../src/nodes/nodes.module';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { ShellCommandNode } from '../src/nodes/tools/shell_command/shell_command.node';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { RunEventsService } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { ArchiveService } from '../src/infra/archive/archive.service';
import { EnvService } from '../src/env/env.service';
import { WorkspaceProvider } from '../src/workspace/providers/workspace.provider';
import { PrismaService } from '../src/core/services/prisma.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { ThreadTransportService } from '../src/messaging/threadTransport.service';

import { ShellCommandTestGraphModule, REQUIRED_CONFIG } from './shellCommand.yaml-config.testHarness';
import { createEventsBusStub, createRunEventsStub } from '../__tests__/helpers/runEvents.stub';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { WorkspaceNode } from '../src/nodes/workspace/workspace.node';
import { DockerWorkspaceEventsWatcher } from '../src/infra/container/containerEvent.watcher';
import { DockerRunnerConnectivityProbe } from '../src/infra/container/dockerRunnerConnectivity.probe';
import { HttpDockerRunnerClient } from '../src/infra/container/httpDockerRunner.client';
import { DOCKER_CLIENT } from '../src/infra/container/dockerClient.token';

const SKIP_RECURSION = process.env.MINIMAL_AGENT_SHELL_SKIP === '1';

if (SKIP_RECURSION) {
  describe.skip('Minimal agent shell reproduction (recursion guard)', () => {
    it('skips to avoid recursive pnpm test invocation', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const heartbeatInterval = setInterval(() => {
    console.info('[minimal-agent-shell] heartbeat');
  }, 15_000);

  afterAll(() => {
    clearInterval(heartbeatInterval);
  });

  const AGENT_NODE_ID = 'minimal-agent-node';
  const WORKSPACE_NODE_ID = 'minimal-workspace-node';
  const SHELL_NODE_ID = 'minimal-shell-node';

  const AGENT_NODE_YAML = [
    `id: ${AGENT_NODE_ID}`,
    'template: agent',
    'config:',
    '  title: Minimal Agent',
    '  model: gpt-test',
    '  systemPrompt: You execute shell commands exactly as instructed.',
    '  sendFinalResponseToThread: false',
    '  restrictOutput: false',
    '',
  ].join('\n');

  const WORKSPACE_NODE_YAML = [
    `id: ${WORKSPACE_NODE_ID}`,
    'template: workspace',
    'config:',
    '  env: []',
    '  workdir: /workspace',
    '',
  ].join('\n');

  const SHELL_NODE_YAML = [
    `id: ${SHELL_NODE_ID}`,
    'template: shellTool',
    'config:',
    '  env: []',
    '  executionTimeoutMs: 300000',
    '  idleTimeoutMs: 60000',
    '  workdir: /workspace',
    '  outputLimitChars: 50000',
    '',
  ].join('\n');

  type EdgeDef = {
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  };

  const MINIMAL_EDGES: EdgeDef[] = [
    {
      source: WORKSPACE_NODE_ID,
      sourceHandle: '$self',
      target: SHELL_NODE_ID,
      targetHandle: 'workspace',
    },
    {
      source: AGENT_NODE_ID,
      sourceHandle: 'tools',
      target: SHELL_NODE_ID,
      targetHandle: '$self',
    },
  ];

  const REPO_WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');

  function normalizeWorkdir(workdir?: string | null): string {
    if (!workdir) return REPO_WORKSPACE_ROOT;
    if (workdir === '/workspace') return REPO_WORKSPACE_ROOT;
    if (workdir.startsWith('/workspace/')) {
      return path.join('/workspace', workdir.slice('/workspace/'.length));
    }
    return workdir;
  }

  async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }

  class RealCommandWorkspaceHandle {
    public readonly id = 'workspace-real-command';
    public lastCommand?: string;
    public lastArchive?: { path?: string; size: number };

    async exec(
      command: string | string[],
      options?: {
        env?: Record<string, string>;
        workdir?: string;
        timeoutMs?: number;
        idleTimeoutMs?: number;
        onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
      },
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
      const normalizedCommand = Array.isArray(command) ? command.join(' ') : command;
      this.lastCommand = normalizedCommand;

      if (normalizedCommand === 'pnpm --filter @agyn/platform-server test') {
        const header = 'pnpm --filter @agyn/platform-server test\n';
        const chunk = ' PASS __tests__/example.spec.ts (0.00 s)\n'.repeat(2200);
        const summary = '\nTest Suites: 128 passed, 128 total\nTests:       856 passed, 856 total\nSnapshots:   0 total\nTime:        120.123 s\n';
        const stdout = header + chunk + summary;
        if (options?.onOutput) {
          options.onOutput('stdout', Buffer.from(stdout));
        }
        return { stdout, stderr: '', exitCode: 0 };
      }

      const env = { ...process.env, ...(options?.env ?? {}), MINIMAL_AGENT_SHELL_SKIP: '1' };
      const profileBin = path.join(os.homedir(), '.nix-profile/bin');
      const nodeBin = '/opt/nodejs/bin';
      const pnpmHome = process.env.PNPM_HOME ?? path.join(os.homedir(), '.local/share/pnpm');
      const existingPath = env.PATH ?? process.env.PATH ?? '';
      env.PATH = Array.from(new Set(existingPath.split(':').concat([profileBin, pnpmHome, nodeBin]))).filter(Boolean).join(':');
      const cwd = normalizeWorkdir(options?.workdir);

      const pnpmExecutable = path.join(pnpmHome, 'pnpm');
      const useDirectPnpm = normalizedCommand.startsWith('pnpm ');
      const directArgs = useDirectPnpm ? normalizedCommand.slice('pnpm '.length).split(' ').filter(Boolean) : [];
      return new Promise((resolve, reject) => {
        const child = useDirectPnpm
          ? spawn(pnpmExecutable, directArgs, {
              cwd,
              env,
              stdio: ['ignore', 'pipe', 'pipe'],
            })
          : spawn('/bin/bash', ['-lc', normalizedCommand], {
              cwd,
              env,
              stdio: ['ignore', 'pipe', 'pipe'],
            });

        let stdout = '';
        let stderr = '';
        let completed = false;

        const timeoutMs = options?.timeoutMs ?? null;
        const idleTimeoutMs = options?.idleTimeoutMs ? Math.max(options.idleTimeoutMs, 5 * 60_000) : null;

        const clearTimers = (timer?: NodeJS.Timeout | null, idleTimer?: NodeJS.Timeout | null) => {
          if (timer) clearTimeout(timer);
          if (idleTimer) clearTimeout(idleTimer);
        };

        const killWithError = (error: Error, timer?: NodeJS.Timeout | null, idleTimer?: NodeJS.Timeout | null) => {
          if (completed) return;
          completed = true;
          clearTimers(timer, idleTimer);
          child.kill('SIGKILL');
          reject(error);
        };

        const timeoutTimer = timeoutMs
          ? setTimeout(() => {
              killWithError(new Error(`exec_timeout_${timeoutMs}`));
            }, timeoutMs)
          : null;

        let idleTimer: NodeJS.Timeout | null = idleTimeoutMs
          ? setTimeout(() => {
              killWithError(new Error(`exec_idle_timeout_${idleTimeoutMs}`), timeoutTimer, idleTimer);
            }, idleTimeoutMs)
          : null;

        const resetIdleTimer = () => {
          if (!idleTimeoutMs) return;
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            killWithError(new Error(`exec_idle_timeout_${idleTimeoutMs}`), timeoutTimer, idleTimer);
          }, idleTimeoutMs);
        };

        const handleChunk = (source: 'stdout' | 'stderr', chunk: Buffer) => {
          resetIdleTimer();
          if (source === 'stdout') stdout += chunk.toString('utf8');
          else stderr += chunk.toString('utf8');
          options?.onOutput?.(source, Buffer.from(chunk));
        };

        child.stdout.on('data', (chunk: Buffer | string) => handleChunk('stdout', Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        child.stderr.on('data', (chunk: Buffer | string) => handleChunk('stderr', Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

        child.on('error', (err) => {
          if (completed) return;
          completed = true;
          clearTimers(timeoutTimer, idleTimer);
          reject(err);
        });

        child.on('close', (code) => {
          if (completed) return;
          completed = true;
          clearTimers(timeoutTimer, idleTimer);
          resolve({ stdout, stderr, exitCode: typeof code === 'number' ? code : -1 });
        });
      });
    }

    async putArchive(data: Buffer | NodeJS.ReadableStream, options?: { path?: string }): Promise<void> {
      const buffer = Buffer.isBuffer(data) ? data : await streamToBuffer(data);
      this.lastArchive = { path: options?.path, size: buffer.length };
    }
  }

  type MinimalHarness = {
    testingModule: TestingModule;
    agentNode: AgentNode;
    shellNode: ShellCommandNode;
    tool: ReturnType<ShellCommandNode['getTool']>;
    runEvents: ReturnType<typeof createRunEventsStub>;
    llmCall: ReturnType<typeof vi.fn>;
    handle: RealCommandWorkspaceHandle;
    tempGraphRoot: string;
    cleanup: () => Promise<void>;
  };

  async function createMinimalHarness(): Promise<MinimalHarness> {
    console.info('[minimal-agent-shell] creating temporary graph');
    const tempGraphRoot = await mkdtemp(path.join(os.tmpdir(), 'minimal-agent-shell-'));
    await mkdir(path.join(tempGraphRoot, 'nodes'), { recursive: true });
    await mkdir(path.join(tempGraphRoot, 'edges'), { recursive: true });

    await writeFile(path.join(tempGraphRoot, 'nodes', `${AGENT_NODE_ID}.yaml`), AGENT_NODE_YAML, 'utf8');
    await writeFile(path.join(tempGraphRoot, 'nodes', `${WORKSPACE_NODE_ID}.yaml`), WORKSPACE_NODE_YAML, 'utf8');
    await writeFile(path.join(tempGraphRoot, 'nodes', `${SHELL_NODE_ID}.yaml`), SHELL_NODE_YAML, 'utf8');

    for (const edge of MINIMAL_EDGES) {
      const id = `${edge.source}-${edge.sourceHandle}__${edge.target}-${edge.targetHandle}`;
      const contents = [`source: ${edge.source}`, `sourceHandle: ${edge.sourceHandle}`, `target: ${edge.target}`, `targetHandle: ${edge.targetHandle}`, ''].join('\n');
      await writeFile(path.join(tempGraphRoot, 'edges', `${encodeURIComponent(id)}.yaml`), contents, 'utf8');
    }

    console.info('[minimal-agent-shell] temp graph prepared at', tempGraphRoot);

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
        containerState: { findMany: vi.fn(async () => []) },
        volume: { findMany: vi.fn(async () => []) },
        conversationState: {
          findUnique: vi.fn(async () => null),
          upsert: vi.fn(async () => undefined),
        },
        conversationStateHistory: { create: vi.fn(async () => undefined) },
        agentRun: { updateMany: vi.fn(async () => ({ count: 0 })) },
        $queryRaw: vi.fn(async () => []),
      }),
    } as unknown as PrismaService;

    const archiveStub = {
      createSingleFileTar: vi.fn(async (_filename: string, content: string, mode: number) => Buffer.from(`tar-${content.length}-${mode}`)),
    } satisfies Pick<ArchiveService, 'createSingleFileTar'>;

    const envStub = { resolveProviderEnv: vi.fn(async () => ({})) } satisfies Pick<EnvService, 'resolveProviderEnv'>;

    const workspaceProviderStub = {
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

    const dockerRunnerStub = {
      ensureImage: vi.fn(async () => undefined),
      start: vi.fn(async () => ({ containerId: 'stub-container' })),
      execContainer: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      openInteractiveExec: vi.fn(async () => {
        throw new Error('interactive exec not supported in minimal harness');
      }),
      touchLastUsed: vi.fn(async () => undefined),
    } as unknown as HttpDockerRunnerClient;

    const dockerClientStub = {
      findContainerByLabels: vi.fn(async () => null),
      listContainersByLabels: vi.fn(async () => []),
      ensureImage: vi.fn(async () => undefined),
      start: vi.fn(async () => ({ id: 'stub-container', remove: vi.fn(), stop: vi.fn() })),
      execContainer: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      openInteractiveExec: vi.fn(async () => {
        throw new Error('interactive exec not supported');
      }),
      touchLastUsed: vi.fn(async () => undefined),
      putArchive: vi.fn(async () => undefined),
      streamContainerLogs: vi.fn(async () => ({ stdout: new PassThrough(), stderr: new PassThrough(), close: vi.fn() })),
      resizeExec: vi.fn(async () => undefined),
      removeContainer: vi.fn(async () => undefined),
      stopContainer: vi.fn(async () => undefined),
    } as Record<string, unknown>;

    const runEvents = createRunEventsStub();
    const eventsBus = {
      ...createEventsBusStub(),
      emitToolOutputChunk: vi.fn(),
      emitToolOutputTerminal: vi.fn(),
    } as unknown as EventsBusService;

    const llmCall = vi.fn(async () => {
      const toolCallSource: ResponseFunctionToolCall = {
        type: 'function_call',
        call_id: 'call-shell-minimal',
        id: 'call-shell-minimal',
        name: 'shell_command',
        arguments: JSON.stringify({ command: 'pnpm --filter @agyn/platform-server test' }),
      };
      const call = new ToolCallMessage(toolCallSource);
      const output = [call.toPlain()] as Response['output'];
      return new ResponseMessage({ output });
    });

    const llmProvisionerStub = {
      getLLM: vi.fn(async () => ({ call: llmCall })),
    } satisfies Pick<LLMProvisioner, 'getLLM'>;

    const agentsPersistenceStub = {
      beginRunThread: vi.fn(async () => ({ runId: 'run-minimal-shell' })),
      completeRun: vi.fn(async () => undefined),
      ensureThreadModel: vi.fn(async (_thread: string, model: string) => model),
      recordInjected: vi.fn(async () => ({ messageIds: [] })),
      getAgentById: vi.fn(),
      upsertAgent: vi.fn(),
      linkAgentToCall: vi.fn(),
      unlinkAgentsFromThread: vi.fn(),
      findAgentsForThread: vi.fn(async () => []),
    } satisfies Partial<AgentsPersistenceService> as AgentsPersistenceService;

    const callAgentLinkingStub = {
      linkAgentNodeToCall: vi.fn(),
      unlinkAgentNodeFromCall: vi.fn(),
    } satisfies Partial<CallAgentLinkingService> as CallAgentLinkingService;

    const transportStub = {
      sendTextToThread: vi.fn(async () => ({ ok: true, threadId: 'thread-minimal' })),
    } satisfies Partial<ThreadTransportService> as ThreadTransportService;

    console.info('[minimal-agent-shell] compiling testing module');
    const testingModule = await Test.createTestingModule({
      imports: [CoreModule, EnvModule, EventsModule, GraphCoreModule, NodesModule, ShellCommandTestGraphModule],
      providers: [RunSignalsRegistry],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(ArchiveService)
      .useValue(archiveStub)
      .overrideProvider(EnvService)
      .useValue(envStub)
      .overrideProvider(WorkspaceProvider)
      .useValue(workspaceProviderStub)
      .overrideProvider(DOCKER_CLIENT)
      .useValue(dockerClientStub)
      .overrideProvider(HttpDockerRunnerClient)
      .useValue(dockerRunnerStub)
      .overrideProvider(DockerRunnerConnectivityProbe)
      .useValue({ onModuleInit: vi.fn(), onModuleDestroy: vi.fn() })
      .overrideProvider(DockerWorkspaceEventsWatcher)
      .useValue({
        start: vi.fn(),
        onModuleDestroy: vi.fn(),
      })
      .overrideProvider(RunEventsService)
      .useValue(runEvents as unknown as RunEventsService)
      .overrideProvider(EventsBusService)
      .useValue(eventsBus)
      .overrideProvider(AgentsPersistenceService)
      .useValue(agentsPersistenceStub)
      .overrideProvider(CallAgentLinkingService)
      .useValue(callAgentLinkingStub)
      .overrideProvider(LLMProvisioner)
      .useValue(llmProvisionerStub as LLMProvisioner)
      .overrideProvider(ThreadTransportService)
      .useValue(transportStub)
      .overrideProvider(RunSignalsRegistry)
      .useValue(new RunSignalsRegistry())
      .compile();

    await testingModule.init();
    console.info('[minimal-agent-shell] testing module initialized');

    const runtime = testingModule.get(LiveGraphRuntime);
    const loadResult = await runtime.load();
    console.info('[minimal-agent-shell] runtime loaded');
    if (!loadResult.applied) {
      throw new Error('Expected minimal graph to be applied');
    }

    const shellNodeInstance = runtime.getNodeInstance(SHELL_NODE_ID);
    if (!(shellNodeInstance instanceof ShellCommandNode)) {
      throw new Error('Shell node instance not found');
    }

    const agentNodeInstance = runtime.getNodeInstance(AGENT_NODE_ID);
    if (!(agentNodeInstance instanceof AgentNode)) {
      throw new Error('Agent node instance not found');
    }

    const handle = new RealCommandWorkspaceHandle();
    console.info('[minimal-agent-shell] workspace handle prepared');

    const workspaceNodeInstance = runtime.getNodeInstance(WORKSPACE_NODE_ID);
    if (!(workspaceNodeInstance instanceof WorkspaceNode)) {
      throw new Error('Workspace node instance not found');
    }

    vi.spyOn(workspaceNodeInstance, 'provide').mockResolvedValue(handle);

    shellNodeInstance.setContainerProvider(workspaceNodeInstance);
    console.info('[minimal-agent-shell] container provider stubbed');

    agentNodeInstance.onModuleInit();
    shellNodeInstance.onModuleInit?.();

    const tool = shellNodeInstance.getTool();

    const cleanup = async () => {
      await testingModule.close();
      await rm(tempGraphRoot, { recursive: true, force: true });
      ConfigService.clearInstanceForTest();
      vi.restoreAllMocks();
    };

    return {
      testingModule,
      agentNode: agentNodeInstance,
      shellNode: shellNodeInstance,
      tool,
      runEvents,
      llmCall,
      handle,
      tempGraphRoot,
      cleanup,
    };
  }

  describe('Minimal agent + shell command graph reproduction', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('invokes shell tool via agent and falls back to non-streaming execution', { timeout: 600_000 }, async () => {
      const harness = await createMinimalHarness();
      const { agentNode, tool, runEvents, llmCall, handle, cleanup } = harness;

      const executeSpy = vi.spyOn(tool, 'execute');
      const executeStreamingSpy = vi.spyOn(tool, 'executeStreaming');

      runEvents.startToolExecution.mockImplementationOnce(async () => {
        throw new Error('run-events unavailable');
      });

      let result: ResponseMessage | ToolCallOutputMessage | undefined;
      try {
        console.info('[minimal-agent-shell] invoking agent');
        result = await agentNode.invoke('thread-minimal', [HumanMessage.fromText('run the full server tests')]);
        console.info('[minimal-agent-shell] agent invocation complete');
      } finally {
        await cleanup();
      }

      const streamingUsed = executeStreamingSpy.mock.calls.length > 0;
      const nonStreamingUsed = executeSpy.mock.calls.length > 0;

      const outputLimitConfig = (tool as unknown as { getResolvedConfig(): { outputLimitChars: number } }).getResolvedConfig();
      const outputLimitType = typeof outputLimitConfig.outputLimitChars;
      const outputLimitValue = outputLimitConfig.outputLimitChars;

      let reducerProducedTooLarge = false;
      let toolOutputText = '';
      if (result instanceof ToolCallOutputMessage) {
        toolOutputText = result.text ?? '';
        reducerProducedTooLarge = toolOutputText.includes('TOOL_OUTPUT_TOO_LARGE');
      }

      console.info('[minimal-agent-shell]', {
        reducerProducedTooLarge,
        outputLimitType,
        outputLimitValue,
        streamingUsed,
        nonStreamingUsed,
        toolOutputPreview: toolOutputText.slice(0, 140),
        llmCallCount: llmCall.mock.calls.length,
        lastCommand: handle.lastCommand,
      });

      expect(nonStreamingUsed).toBe(true);
      expect(streamingUsed).toBe(false);
      expect(outputLimitType).toBe('number');
      expect(outputLimitValue).toBe(50000);
      expect(reducerProducedTooLarge).toBe(false);
      expect(toolOutputText).toMatch(/^Error: output length exceeds 50000 characters\. It was saved on disk: \/tmp\//);
    });
  });
}
