import 'reflect-metadata';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { ManageFunctionTool } from '../../src/nodes/tools/manage/manage.tool';
import type { ManageToolNode } from '../../src/nodes/tools/manage/manage.node';
import type { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';
import type { LLMContext } from '../../src/llm/types';
import { HumanMessage } from '@agyn/llm';

const createCtx = (overrides: Partial<LLMContext> = {}): LLMContext => ({
  threadId: 'parent-thread',
  callerAgent: {
    invoke: vi.fn().mockResolvedValue(undefined),
  },
  ...overrides,
} as unknown as LLMContext);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ManageFunctionTool.execute', () => {
  it('awaits child response in sync mode and returns formatted text', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-1'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const manageNode = {
      nodeId: 'manage-node-1',
      listWorkers: vi.fn().mockReturnValue(['Worker Alpha']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn().mockResolvedValue('child response text'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn().mockImplementation((worker: string, text: string) => `Response from: ${worker}
${text}`),
      renderAsyncAcknowledgement: vi.fn(),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hello', threadAlias: undefined }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'worker-alpha', 'parent-thread', '');
    expect(persistence.setThreadChannelNode).toHaveBeenCalledWith('child-thread-1', 'manage-node-1');
    expect(manageNode.registerInvocation).toHaveBeenCalledWith({
      childThreadId: 'child-thread-1',
      parentThreadId: 'parent-thread',
      workerTitle: 'Worker Alpha',
      callerAgent: ctx.callerAgent,
    });
    expect(manageNode.awaitChildResponse).toHaveBeenCalledWith('child-thread-1', 64000);
    expect(workerInvoke).toHaveBeenCalledTimes(1);
    const [, messages] = workerInvoke.mock.calls[0];
    expect(Array.isArray(messages)).toBe(true);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect((messages[0] as HumanMessage).text).toBe('hello');
    expect(manageNode.renderWorkerResponse).toHaveBeenCalledWith('Worker Alpha', 'child response text');
    expect(result).toBe('Response from: Worker Alpha\nchild response text');
  });

  it('sanitizes provided threadAlias before persistence', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-alias'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const manageNode = {
      nodeId: 'manage-node-alias',
      listWorkers: vi.fn().mockReturnValue(['Worker Alpha']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const rawAlias = 'Casey Brooks (Engineer)-hautechai-agents-send-message';
    const expectedAlias = rawAlias
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 64);

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledWith(
      'manage',
      expectedAlias,
      'parent-thread',
      '',
    );
    expect(expectedAlias.length).toBeLessThanOrEqual(64);
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Worker Alpha');
  });

  it('enforces 64 character limit on sanitized aliases', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-long'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const manageNode = {
      nodeId: 'manage-node-long',
      listWorkers: vi.fn().mockReturnValue(['Worker Alpha']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const rawAlias = 'A'.repeat(100);

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    const aliasMock = vi.mocked(persistence.getOrCreateSubthreadByAlias);
    const aliasArg = aliasMock.mock.calls[0][1] as string;
    expect(aliasArg.length).toBeLessThanOrEqual(64);
    expect(aliasArg).toBe('a'.repeat(64));
  });

  it('returns acknowledgement in async mode without awaiting child response', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-2'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'ignored' });
    const manageNode = {
      nodeId: 'manage-node-2',
      listWorkers: vi.fn().mockReturnValue(['Async Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalled();
    expect(persistence.setThreadChannelNode).toHaveBeenCalledWith('child-thread-2', 'manage-node-2');
    expect(manageNode.awaitChildResponse).not.toHaveBeenCalled();
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Async Worker');
    expect(workerInvoke).toHaveBeenCalledTimes(1);
    expect(result).toBe('async acknowledgement');
  });

  it('logs and continues when async invoke returns non-promise', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-non-promise'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockReturnValue({ text: 'sync result' });
    const manageNode = {
      nodeId: 'manage-node-non-promise',
      listWorkers: vi.fn().mockReturnValue(['Async Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx);

    expect(result).toBe('async acknowledgement');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: async send_message invoke returned non-promise {"worker":"Async Worker","childThreadId":"child-thread-non-promise","resultType":"object"}',
    );
  });

  it('returns acknowledgement immediately for delayed async invocation and logs no errors', async () => {
    vi.useFakeTimers();

    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-delayed'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => resolve({ text: 'late reply' }), 2000);
      }),
    );
    const manageNode = {
      nodeId: 'manage-node-delayed',
      listWorkers: vi.fn().mockReturnValue(['Async Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx),
    ).resolves.toBe('async acknowledgement');

    expect(loggerErrorSpy).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('logs async non-error rejections without crashing', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-async'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue('boom');
    const manageNode = {
      nodeId: 'manage-node-async',
      listWorkers: vi.fn().mockReturnValue(['Async Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"worker":"Async Worker","childThreadId":"child-thread-async","error":"boom"}',
      );
    });
  });

  it('logs async undefined rejections without crashing', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-undefined'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue(undefined);
    const manageNode = {
      nodeId: 'manage-node-undefined',
      listWorkers: vi.fn().mockReturnValue(['Async Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"worker":"Async Worker","childThreadId":"child-thread-undefined","error":"undefined"}',
      );
    });
  });

  it('logs async non-error object rejections using message field', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-object'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const diagnostic = { message: 'custom diagnostic', code: 'X' };
    const workerInvoke = vi.fn().mockRejectedValue(diagnostic);
    const manageNode = {
      nodeId: 'manage-node-object',
      listWorkers: vi.fn().mockReturnValue(['Async Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"worker":"Async Worker","childThreadId":"child-thread-object","error":"custom diagnostic"}',
      );
    });
  });

  it('rethrows non-error rejections and logs safely', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-sync'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue('boom');
    const manageNode = {
      nodeId: 'manage-node-sync',
      listWorkers: vi.fn().mockReturnValue(['Fail Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn().mockResolvedValue('ignored'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn(),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Fail Worker', message: 'fail', threadAlias: undefined }, ctx),
    ).rejects.toBe('boom');

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: send_message failed {"worker":"Fail Worker","childThreadId":"child-thread-sync","error":"boom"}',
    );
  });

  it('rethrows non-error objects while logging their message', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-sync-object'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const diagnostic = { message: 'sync diagnostic', code: 'Y' };
    const workerInvoke = vi.fn().mockRejectedValue(diagnostic);
    const manageNode = {
      nodeId: 'manage-node-sync-object',
      listWorkers: vi.fn().mockReturnValue(['Fail Worker']),
      getWorkerByTitle: vi.fn().mockReturnValue({ invoke: workerInvoke }),
      registerInvocation: vi.fn().mockResolvedValue(undefined),
      awaitChildResponse: vi.fn().mockResolvedValue('ignored'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn(),
    } as unknown as ManageToolNode;

    const tool = new ManageFunctionTool(persistence);
    tool.init(manageNode, { persistence });

    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error');

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Fail Worker', message: 'fail', threadAlias: undefined }, ctx),
    ).rejects.toEqual(diagnostic);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: send_message failed {"worker":"Fail Worker","childThreadId":"child-thread-sync-object","error":"sync diagnostic"}',
    );
  });
});
