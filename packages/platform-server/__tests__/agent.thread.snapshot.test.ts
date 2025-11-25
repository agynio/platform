import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ResponseMessage, AIMessage, HumanMessage, FunctionTool } from '@agyn/llm';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { RunEventsService } from '../src/events/run-events.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { z } from 'zod';

class StubProvisioner extends LLMProvisioner {
  async getLLM() {
    return {
      call: async () => new ResponseMessage({ output: [AIMessage.fromText('ok').toPlain()] }),
    };
  }
}

class DummyTool extends FunctionTool<z.ZodObject> {
  constructor(private readonly toolName: string) {
    super();
  }

  get name() {
    return this.toolName;
  }

  get schema() {
    return z.object({});
  }

  get description() {
    return 'dummy';
  }

  async execute(): Promise<string> {
    return JSON.stringify({ ok: true });
  }
}

const DEFAULT_SUMMARY_PROMPT =
  'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat. Structure summary with 3 high level sections: initial task, plan (if any), context (progress, findings, observations).';

describe('Agent thread config snapshot', () => {
  const baseConfig = new ConfigService().init(
    configSchema.parse({ llmProvider: 'openai', agentsDatabaseUrl: 'postgres://user:pass@host/db' }),
  );

  it('persists snapshot candidate on first run', async () => {
    const ensureThreadConfigSnapshot = vi.fn(
      async (params: { agentNodeId: string; snapshot: unknown }) => ({
        agentNodeId: params.agentNodeId,
        snapshot: params.snapshot,
        snapshotAt: new Date('2025-02-01T00:00:00Z'),
      }),
    );
    const beginRunThread = vi.fn(async () => ({ runId: 'run-1' }));
    const completeRun = vi.fn(async () => {});
    const recordInjected = vi.fn(async () => ({ messageIds: [] }));
    const recordSnapshotToolWarning = vi.fn();
    const getActiveGraphMeta = vi.fn(async () => ({
      name: 'main',
      version: 3,
      updatedAt: '2025-02-01T00:00:00.000Z',
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: baseConfig },
        { provide: LLMProvisioner, useClass: StubProvisioner },
        AgentNode,
        {
          provide: PrismaService,
          useValue: {
            getClient: () => ({
              conversationState: {
                findUnique: async () => null,
                upsert: async () => {},
              },
            }),
          },
        },
        {
          provide: RunEventsService,
          useValue: {
            recordSummarization: vi.fn(async () => ({ id: 'event-id', type: 'summarization' })),
            createContextItems: vi.fn(async () => ['ctx-item']),
            startLLMCall: vi.fn(async () => ({ id: 'llm-event' })),
            completeLLMCall: vi.fn(async () => {}),
          },
        },
        { provide: EventsBusService, useValue: { publishEvent: vi.fn(async () => {}) } },
        RunSignalsRegistry,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread,
            completeRun,
            recordInjected,
            ensureThreadConfigSnapshot,
            getActiveGraphMeta,
            recordSnapshotToolWarning,
          },
        },
      ],
    }).compile();

    const agent = await moduleRef.resolve(AgentNode);
    agent.init({ nodeId: 'agent-node' });
    await agent.setConfig({});

    const res = await agent.invoke('thread-1', [HumanMessage.fromText('hello')]);
    expect(res).toBeInstanceOf(ResponseMessage);
    expect(ensureThreadConfigSnapshot).toHaveBeenCalledTimes(1);
    const callArgs = ensureThreadConfigSnapshot.mock.calls[0]?.[0];
    expect(callArgs.threadId).toBe('thread-1');
    const snapshot = callArgs.snapshot as {
      version: number;
      agentNodeId: string;
      graph: { name: string; version: number; updatedAt: string };
      llm: { provider: string; model: string };
      prompts: { system: string; summarization: string };
      summarization: { keepTokens: number; maxTokens: number };
      behavior: {
        debounceMs: number;
        whenBusy: string;
        processBuffer: string;
        restrictOutput: boolean;
        restrictionMessage: string;
        restrictionMaxInjections: number;
      };
      tools: { allowed: unknown[] };
      memory: { placement: string };
    };
    expect(snapshot.version).toBe(1);
    expect(snapshot.agentNodeId).toBe('agent-node');
    expect(snapshot.graph).toEqual({ name: 'main', version: 3, updatedAt: '2025-02-01T00:00:00.000Z' });
    expect(snapshot.llm).toEqual({ provider: 'openai', model: 'gpt-5' });
    expect(snapshot.prompts.system).toBe('You are a helpful AI assistant.');
    expect(snapshot.prompts.summarization).toBe(DEFAULT_SUMMARY_PROMPT);
    expect(snapshot.summarization).toEqual({ keepTokens: 0, maxTokens: 512 });
    expect(snapshot.behavior).toEqual({
      debounceMs: 0,
      whenBusy: 'wait',
      processBuffer: 'allTogether',
      restrictOutput: false,
      restrictionMessage:
        "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.",
      restrictionMaxInjections: 0,
    });
    expect(snapshot.tools.allowed).toEqual([]);
    expect(snapshot.memory.placement).toBe('none');
    expect(recordSnapshotToolWarning).not.toHaveBeenCalled();

    await moduleRef.close();
  });

  it('records warning when snapshot references missing tool', async () => {
    const runId = 'run-missing-tool';
    const beginRunThread = vi.fn(async () => ({ runId }));
    const completeRun = vi.fn(async () => {});
    const recordInjected = vi.fn(async () => ({ messageIds: [] }));
    const recordSnapshotToolWarning = vi.fn(async () => {});
    const getActiveGraphMeta = vi.fn();

    const storedSnapshot = {
      version: 1,
      agentNodeId: 'agent-node',
      graph: { name: 'main', version: 1, updatedAt: '2025-02-02T00:00:00.000Z' },
      llm: { provider: 'openai', model: 'gpt-5' },
      prompts: { system: 'You are a helpful AI assistant.', summarization: DEFAULT_SUMMARY_PROMPT },
      summarization: { keepTokens: 0, maxTokens: 512 },
      behavior: {
        debounceMs: 25,
        whenBusy: 'wait' as const,
        processBuffer: 'allTogether' as const,
        restrictOutput: false,
        restrictionMessage:
          "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.",
        restrictionMaxInjections: 0,
      },
      tools: {
        allowed: [{ name: 'missing_tool', namespace: null, kind: 'native' as const }],
      },
      memory: { placement: 'none' as const },
    };

    const ensureThreadConfigSnapshot = vi.fn(async () => ({
      agentNodeId: 'agent-node',
      snapshot: storedSnapshot,
      snapshotAt: new Date('2025-02-02T00:00:01Z'),
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ConfigService, useValue: baseConfig },
        { provide: LLMProvisioner, useClass: StubProvisioner },
        AgentNode,
        {
          provide: PrismaService,
          useValue: {
            getClient: () => ({
              conversationState: {
                findUnique: async () => null,
                upsert: async () => {},
              },
            }),
          },
        },
        {
          provide: RunEventsService,
          useValue: {
            recordSummarization: vi.fn(async () => ({ id: 'event-id', type: 'summarization' })),
            createContextItems: vi.fn(async () => ['ctx-item']),
            startLLMCall: vi.fn(async () => ({ id: 'llm-event' })),
            completeLLMCall: vi.fn(async () => {}),
          },
        },
        { provide: EventsBusService, useValue: { publishEvent: vi.fn(async () => {}) } },
        RunSignalsRegistry,
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread,
            completeRun,
            recordInjected,
            ensureThreadConfigSnapshot,
            getActiveGraphMeta,
            recordSnapshotToolWarning,
          },
        },
      ],
    }).compile();

    const agent = await moduleRef.resolve(AgentNode);
    agent.init({ nodeId: 'agent-node' });
    await agent.setConfig({ debounceMs: 5 });

    const tool = new DummyTool('other_tool');
    (agent as unknown as { tools: Set<FunctionTool> }).tools.add(tool);

    const result = await agent.invoke('thread-1', [HumanMessage.fromText('ping')]);
    expect(result).toBeInstanceOf(ResponseMessage);

    expect(recordSnapshotToolWarning).toHaveBeenCalledTimes(1);
    const warningArgs = recordSnapshotToolWarning.mock.calls[0]?.[0] as {
      toolName: string;
      allowedTools: string[];
      runId: string;
    };
    expect(warningArgs.toolName).toBe('missing_tool');
    expect(warningArgs.allowedTools).toEqual(['missing_tool']);
    expect(warningArgs.runId).toBe(runId);

    await moduleRef.close();
  });
});
