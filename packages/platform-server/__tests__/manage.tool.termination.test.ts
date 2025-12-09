import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import { ManageFunctionTool } from '../src/nodes/tools/manage/manage.tool';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { ResponseMessage, HumanMessage } from '@agyn/llm';
import type { AgentNode } from '../src/nodes/agent/agent.node';
import type { LLMContext } from '../src/llm/types';
import { Signal } from '../src/signal';

const createManageTool = async (options?: { timeoutMs?: number }) => {
  const persistence = {
    getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-terminate'),
    setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentsPersistenceService;
  const linking = {
    registerParentToolExecution: vi.fn().mockResolvedValue('evt-manage'),
  } as unknown as CallAgentLinkingService;

  const node = new ManageToolNode(persistence, linking);
  node.init({ nodeId: 'manage-node-termination' });
  await node.setConfig({ mode: 'sync', timeoutMs: options?.timeoutMs ?? 0 });
  const tool = node.getTool() as ManageFunctionTool;

  return { node, tool, persistence, linking };
};

const buildContext = (overrides?: Partial<LLMContext>): LLMContext =>
  ({
    threadId: 'parent-thread',
    runId: 'parent-run',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { invoke: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  }) as LLMContext;

describe('Manage tool termination handling', () => {
  it('resolves sync waiter when termination message arrives', async () => {
    const { node, tool } = await createManageTool();

    const workerAgent = {
      config: { name: 'Worker One', sendFinalResponseToThread: true },
      invoke: vi.fn().mockResolvedValue(ResponseMessage.fromText('child completed')), // child reply unused in sync path
    } as unknown as AgentNode;

    node.addWorker(workerAgent);

    const ctx = buildContext();

    const executionPromise = tool.execute(
      { command: 'send_message', worker: 'Worker One', message: 'handle task' },
      ctx,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    await node.sendToChannel('child-thread-terminate', 'terminated');
    const rendered = await executionPromise;

    expect(workerAgent.invoke).toHaveBeenCalledTimes(1);
    expect(workerAgent.invoke).toHaveBeenCalledWith(
      'child-thread-terminate',
      expect.arrayContaining([expect.any(HumanMessage)]),
    );
    expect(rendered).toBe('Response from: Worker One\nterminated');
  });
});
