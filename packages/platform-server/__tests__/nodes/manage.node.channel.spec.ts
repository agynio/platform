import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ManageToolNode } from '../../src/nodes/tools/manage/manage.node';
import type { ManageFunctionTool } from '../../src/nodes/tools/manage/manage.tool';
import type { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';
import { HumanMessage } from '@agyn/llm';

describe('ManageToolNode sendToChannel', () => {
  let node: ManageToolNode;

  beforeEach(async () => {
    const fakeTool = { init: vi.fn().mockReturnValue({}) } as unknown as ManageFunctionTool;
    const fakePersistence = {} as unknown as AgentsPersistenceService;
    node = new ManageToolNode(fakeTool, fakePersistence);
    node.init({ nodeId: 'manage-node-test' });
    await node.setConfig({ mode: 'sync', timeoutMs: 1000 } as unknown as ManageToolNode['config']);
  });

  it('resolves pending waiter and returns success in sync mode', async () => {
    const waiter = node.awaitChildResponse('child-thread-1', 5000);
    const sendResult = await node.sendToChannel('child-thread-1', 'ready to go');
    const resolved = await waiter;

    expect(sendResult.ok).toBe(true);
    expect(sendResult.threadId).toBe('child-thread-1');
    expect(resolved).toBe('ready to go');
  });

  it('waits indefinitely when timeout is disabled', async () => {
    await node.setConfig({ mode: 'sync', timeoutMs: 0 } as unknown as ManageToolNode['config']);
    const waiter = node.awaitChildResponse('child-thread-zero', 0);

    await new Promise((resolve) => setTimeout(resolve, 75));

    const sendResult = await node.sendToChannel('child-thread-zero', 'delayed response');
    const resolved = await waiter;

    expect(sendResult.ok).toBe(true);
    expect(resolved).toBe('delayed response');
  });

  it('forwards messages to parent thread in async mode', async () => {
    await node.setConfig({ mode: 'async', timeoutMs: 1000 } as unknown as ManageToolNode['config']);
    const parentInvoke = vi.fn().mockResolvedValue(undefined);

    await node.registerInvocation({
      childThreadId: 'child-thread-async',
      parentThreadId: 'parent-thread',
      workerTitle: 'Async Worker',
      callerAgent: { invoke: parentInvoke },
    });

    const result = await node.sendToChannel('child-thread-async', 'async payload');

    expect(result.ok).toBe(true);
    expect(parentInvoke).toHaveBeenCalledTimes(1);
    const [threadId, messages] = parentInvoke.mock.calls[0];
    expect(threadId).toBe('parent-thread');
    expect(Array.isArray(messages)).toBe(true);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect((messages[0] as HumanMessage).text).toContain('async payload');
    expect((messages[0] as HumanMessage).text).toContain('Response from: Async Worker');
  });

  it('flushes queued sync messages before registering a new invocation', async () => {
    const priorCaller = { invoke: vi.fn().mockResolvedValue(undefined) };
    await node.registerInvocation({
      childThreadId: 'child-thread-1',
      parentThreadId: 'parent-1',
      workerTitle: 'Worker One',
      callerAgent: priorCaller,
    });

    await node.sendToChannel('child-thread-1', 'stale response');

    const nextCaller = { invoke: vi.fn().mockResolvedValue(undefined) };
    await node.registerInvocation({
      childThreadId: 'child-thread-1',
      parentThreadId: 'parent-2',
      workerTitle: 'Worker Two',
      callerAgent: nextCaller,
    });

    expect(priorCaller.invoke).toHaveBeenCalledTimes(1);
    const [threadId, messages] = priorCaller.invoke.mock.calls[0];
    expect(threadId).toBe('parent-1');
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect((messages[0] as HumanMessage).text).toContain('stale response');
    expect((messages[0] as HumanMessage).text).toContain('Worker One');
  });

  it('returns error when async channel response lacks invocation context', async () => {
    await node.setConfig({ mode: 'async', timeoutMs: 1000 } as unknown as ManageToolNode['config']);
    const result = await node.sendToChannel('missing-child', 'payload');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing_invocation_context');
  });

  it('surfaces errors when forwarding to parent fails', async () => {
    await node.setConfig({ mode: 'async', timeoutMs: 1000 } as unknown as ManageToolNode['config']);
    const parentInvoke = vi.fn().mockRejectedValue(new Error('parent unreachable'));

    await node.registerInvocation({
      childThreadId: 'child-thread-fail',
      parentThreadId: 'parent-thread',
      workerTitle: 'Async Worker',
      callerAgent: { invoke: parentInvoke },
    });

    const result = await node.sendToChannel('child-thread-fail', 'payload');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('forward_failed');
    expect(parentInvoke).toHaveBeenCalledTimes(1);
  });
});
