import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';

import type { GraphDefinition } from '../src/shared/types/graph.types';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { buildTemplateRegistry } from '../src/templates';
import { GraphRepository } from '../src/graph/graph.repository';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import type { LLMContext } from '../src/llm/types';
import { Signal } from '../src/signal';
import { EventsBusService } from '../src/events/events-bus.service';
import { ResponseMessage } from '@agyn/llm';

class StubGraphRepository extends GraphRepository {
  async initIfNeeded(): Promise<void> {}
  async get(): Promise<null> {
    return null;
  }
  async upsert(): Promise<never> {
    throw new Error('not-implemented');
  }
  async upsertNodeState(): Promise<void> {}
}

class TestEventsBus {
  private listeners = new Set<(payload: { threadId: string; message: { id: string; kind: 'assistant'; text: string; createdAt: Date; runId?: string } }) => void>();
  public subscribeCount = 0;

  subscribeToMessageCreated(listener: (payload: { threadId: string; message: { id: string; kind: 'assistant'; text: string; createdAt: Date; runId?: string } }) => void): () => void {
    this.subscribeCount += 1;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitMessage(payload: { threadId: string; message: { id: string; kind: 'assistant'; text: string; createdAt: Date; runId?: string } }): void {
    for (const listener of this.listeners) listener(payload);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

function buildCtx(): LLMContext {
  return {
    threadId: 'parent-thread',
    runId: 'run-parent',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { invoke: async () => new ResponseMessage({ output: [] }) },
  } as LLMContext;
}

async function createRuntime() {
  const persistence = {
    getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread'),
    updateThreadChannelDescriptor: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentsPersistenceService;
  const eventsBus = new TestEventsBus();
  const providers: Array<{ provide: unknown; useValue?: unknown; useClass?: unknown }> = [
    ManageFunctionTool,
    ManageToolNode,
    { provide: AgentsPersistenceService, useValue: persistence },
    { provide: EventsBusService, useValue: eventsBus as unknown as EventsBusService },
  ];

  const testingModule = await Test.createTestingModule({ providers }).compile();
  const moduleRef = testingModule.get(ModuleRef);
  const registry = buildTemplateRegistry({ moduleRef });
  const runtime = new LiveGraphRuntime(
    registry,
    new StubGraphRepository(),
    moduleRef,
    { resolve: async (input: unknown) => ({ output: input, report: {} as Record<string, unknown> }) } as any,
  );

  const graph: GraphDefinition = {
    nodes: [
      {
        id: 'manage',
        data: {
          template: 'manageTool',
          config: {
            mode: 'sync',
            syncTimeoutMs: 1000,
            syncMaxMessages: 1,
            asyncPrefix: 'From {{agentTitle}}: ',
            showCorrelationInOutput: false,
          },
        },
      },
    ],
    edges: [],
  };

  await runtime.apply(graph);
  const node = runtime.getNodeInstance('manage') as ManageToolNode;
  return { module: testingModule, runtime, node, persistence, eventsBus };
}

describe('LiveGraphRuntime -> Manage tool DI integration', () => {
  it('boots via LiveGraphRuntime and subscribes to EventsBusService for sync responses', async () => {
    const harness = await createRuntime();
    const tool = harness.node.getTool();
    const eventsBus = harness.eventsBus;

    expect(eventsBus.subscribeCount).toBe(0);

    const worker = {
      config: { title: 'worker-1' },
      async invoke(threadId: string) {
        setTimeout(() => {
          eventsBus.emitMessage({
            threadId,
            message: {
              id: 'msg-1',
              kind: 'assistant',
              text: 'bus-response',
              createdAt: new Date(),
              runId: 'child-run',
            },
          });
        }, 10);
        return ResponseMessage.fromText('queued');
      },
    } as unknown as ManageToolNode['getWorkers'][number];

    harness.node.addWorker(worker);

    const result = await tool.execute(
      { command: 'send_message', worker: 'worker-1', message: 'ping' },
      buildCtx(),
    );

    expect(result).toBe('Response from: worker-1\nbus-response');
    expect(eventsBus.subscribeCount).toBeGreaterThanOrEqual(1);
    expect(eventsBus.listenerCount).toBe(0);

    await harness.module.close();
  });
});
