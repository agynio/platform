import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { ResponseMessage, HumanMessage } from '@agyn/llm';
import type { AgentNode } from '../src/nodes/agent/agent.node';
import type { LLMContext } from '../src/llm/types';
import { Signal } from '../src/signal';

const createSyncManageTool = async (timeoutMs: number) => {
  const persistence = {
    getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-timeout'),
    setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentsPersistenceService;
  const linking = {
    registerParentToolExecution: vi.fn().mockResolvedValue('evt-timeout'),
  } as unknown as CallAgentLinkingService;

  const node = new ManageToolNode(persistence, linking);
  node.init({ nodeId: 'manage-node-timeout' });
  await node.setConfig({ mode: 'sync', timeoutMs });
  const tool = node.getTool();

  const workerAgent = {
    config: { name: 'Timeout Worker', sendFinalResponseToThread: true },
    invoke: vi.fn().mockResolvedValue(ResponseMessage.fromText('placeholder')),
  } as unknown as AgentNode;

  node.addWorker(workerAgent);

  const context = {
    threadId: 'parent-thread',
    runId: 'parent-run',
    finishSignal: new Signal(),
    terminateSignal: new Signal(),
    callerAgent: { invoke: vi.fn().mockResolvedValue(undefined) },
  } as LLMContext;

  return { node, tool, workerAgent, context };
};

describe('Manage tool timeout behaviour', () => {
  it('rejects sync invocation when child response does not arrive within timeout', async () => {
    vi.useFakeTimers();
    try {
      const { tool, workerAgent, context } = await createSyncManageTool(25);

      const executionPromise = tool.execute(
        { command: 'send_message', worker: 'Timeout Worker', message: 'do work' },
        context,
      );

      const expectation = expect(executionPromise).rejects.toThrow('manage_timeout');

      await vi.advanceTimersByTimeAsync(30);
      await expectation;

      expect(workerAgent.invoke).toHaveBeenCalledTimes(1);
      expect(workerAgent.invoke).toHaveBeenCalledWith(
        'child-thread-timeout',
        expect.arrayContaining([expect.any(HumanMessage)]),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
