import 'reflect-metadata';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { ManageFunctionTool } from '../../src/nodes/tools/manage/manage.tool';
import type { ManageToolNode } from '../../src/nodes/tools/manage/manage.node';
import type { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';
import type { LLMContext } from '../../src/llm/types';
import { HumanMessage } from '@agyn/llm';
import type { CallAgentLinkingService } from '../../src/agents/call-agent-linking.service';

type ToolLogger = { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

type WorkerAgent = { invoke: ReturnType<typeof vi.fn> };

const createManageNodeStub = (
  workerName: string,
  agent: WorkerAgent,
  overrides: Record<string, unknown> = {},
): ManageToolNode => {
  const base = {
    nodeId: 'manage-node',
    config: {},
    listWorkers: vi.fn().mockReturnValue([workerName]),
    getWorkerByName: vi.fn().mockImplementation((name: string) =>
      name.trim().toLowerCase() === workerName.toLowerCase() ? (agent as unknown as ManageToolNode['getWorkers'][number]) : undefined,
    ),
    getWorkers: vi.fn().mockReturnValue([agent as unknown as ManageToolNode['getWorkers'][number]]),
    getWorkerName: vi.fn().mockImplementation((value: ManageToolNode['getWorkers'][number]) => {
      if (value === (agent as unknown as ManageToolNode['getWorkers'][number])) return workerName;
      throw new Error('unexpected agent');
    }),
    registerInvocation: vi.fn().mockResolvedValue(undefined),
    awaitChildResponse: vi.fn().mockResolvedValue('child response text'),
    getMode: vi.fn().mockReturnValue('sync'),
    getTimeoutMs: vi.fn().mockReturnValue(64000),
    renderWorkerResponse: vi
      .fn()
      .mockImplementation((worker: string, text: string) => `Response from: ${worker}\n${text}`),
    renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
  } satisfies Record<string, unknown>;
  return Object.assign(base, overrides) as unknown as ManageToolNode;
};

const createCtx = (overrides: Partial<LLMContext> = {}): LLMContext => ({
  threadId: 'parent-thread',
  runId: 'parent-run',
  callerAgent: {
    invoke: vi.fn().mockResolvedValue(undefined),
  },
  ...overrides,
} as unknown as LLMContext);

const createToolInstance = (
  persistence: AgentsPersistenceService,
  manageNode: ManageToolNode,
  linking?: { registerParentToolExecution: ReturnType<typeof vi.fn> },
) => {
  const linkingMock = linking ?? {
    registerParentToolExecution: vi.fn().mockResolvedValue('evt-manage'),
  };
  const tool = new ManageFunctionTool(
    persistence,
    linkingMock as unknown as CallAgentLinkingService,
  );
  tool.init(manageNode);
  const logger = (tool as unknown as { logger: ToolLogger }).logger;
  return { tool, linking: linkingMock, logger };
};

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
    const workerName = 'Worker Alpha';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-1',
      awaitChildResponse: vi.fn().mockResolvedValue('child response text'),
      getMode: vi.fn().mockReturnValue('sync'),
    });

    const { tool, linking } = createToolInstance(persistence, manageNode);

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hello', threadAlias: undefined }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledWith('manage', 'worker-alpha', 'parent-thread', '');
    expect(persistence.setThreadChannelNode).toHaveBeenCalledWith('child-thread-1', 'manage-node-1');
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-1',
      toolName: 'manage',
    });
    expect(manageNode.registerInvocation).toHaveBeenCalledWith({
      childThreadId: 'child-thread-1',
      parentThreadId: 'parent-thread',
      workerName: 'Worker Alpha',
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

  it('logs warning when parent run linking fails but continues execution', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-link-fail'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub('Worker Alpha', workerAgent, {
      nodeId: 'manage-node-link-fail',
      awaitChildResponse: vi.fn().mockResolvedValue('child response text'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn().mockReturnValue('formatted'),
      renderAsyncAcknowledgement: vi.fn(),
    });

    const linking = {
      registerParentToolExecution: vi.fn().mockRejectedValue(new Error('link service down')),
    };

    const { tool, logger } = createToolInstance(persistence, manageNode, linking);

    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const ctx = createCtx({ runId: 'run-link-fail' });
    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hello', threadAlias: undefined }, ctx);

    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: 'run-link-fail',
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-link-fail',
      toolName: 'manage',
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Manage: failed to register parent tool execution {"parentThreadId":"parent-thread","childThreadId":"child-thread-link-fail","runId":"run-link-fail","error":{"name":"Error","message":"link service down"}}',
    );
  });

  it('reuses provided threadAlias without altering case when accepted', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-alias'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const workerName = 'Worker Alpha';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-alias',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking } = createToolInstance(persistence, manageNode);

    const ctx = createCtx();
    const rawAlias = '  Mixed.Alias-Case_123  ';

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalledWith(
      'manage',
      'Mixed.Alias-Case_123',
      'parent-thread',
      '',
    );
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Worker Alpha');
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-alias',
      toolName: 'manage',
    });
  });

  it('falls back to sanitized alias when provided alias is rejected', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi
        .fn()
        .mockRejectedValueOnce(new Error('invalid alias'))
        .mockResolvedValue('child-thread-fallback'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const workerName = 'Worker Alpha';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-fallback',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const ctx = createCtx();
    const rawAlias = 'Invalid Alias!';

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    const aliasMock = vi.mocked(persistence.getOrCreateSubthreadByAlias);
    expect(aliasMock).toHaveBeenNthCalledWith(1, 'manage', 'Invalid Alias!', 'parent-thread', '');
    expect(aliasMock).toHaveBeenNthCalledWith(2, 'manage', 'invalid-alias', 'parent-thread', '');
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Manage: provided threadAlias invalid, using sanitized fallback {"workerName":"Worker Alpha","parentThreadId":"parent-thread","providedAlias":"Invalid Alias!","fallbackAlias":"invalid-alias"}',
    );
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Worker Alpha');
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-fallback',
      toolName: 'manage',
    });
  });

  it('fallback alias enforces 64 character limit', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi
        .fn()
        .mockRejectedValueOnce(new Error('too long'))
        .mockResolvedValue('child-thread-long'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'invoke result' });
    const workerName = 'Worker Alpha';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-long',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking } = createToolInstance(persistence, manageNode);

    const ctx = createCtx();
    const rawAlias = 'A'.repeat(100);

    await tool.execute({ command: 'send_message', worker: 'Worker Alpha', message: 'hi', threadAlias: rawAlias }, ctx);

    const aliasMock = vi.mocked(persistence.getOrCreateSubthreadByAlias);
    const fallbackAlias = aliasMock.mock.calls[1][1] as string;
    expect(fallbackAlias.length).toBeLessThanOrEqual(64);
    expect(fallbackAlias).toBe('a'.repeat(64));
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Worker Alpha');
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-long',
      toolName: 'manage',
    });
  });

  it('returns acknowledgement in async mode without awaiting child response', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-2'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockResolvedValue({ text: 'ignored' });
    const workerName = 'Async Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-2',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking } = createToolInstance(persistence, manageNode);

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx);

    expect(persistence.getOrCreateSubthreadByAlias).toHaveBeenCalled();
    expect(persistence.setThreadChannelNode).toHaveBeenCalledWith('child-thread-2', 'manage-node-2');
    expect(manageNode.awaitChildResponse).not.toHaveBeenCalled();
    expect(manageNode.renderAsyncAcknowledgement).toHaveBeenCalledWith('Async Worker');
    expect(workerInvoke).toHaveBeenCalledTimes(1);
    expect(result).toBe('async acknowledgement');
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-2',
      toolName: 'manage',
    });
  });

  it('logs and continues when async invoke returns non-promise', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-non-promise'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockReturnValue({ text: 'sync result' });
    const workerName = 'Async Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-non-promise',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const ctx = createCtx();
    const result = await tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx);

    expect(result).toBe('async acknowledgement');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: async send_message invoke returned non-promise {"workerName":"Async Worker","childThreadId":"child-thread-non-promise","resultType":"object","promiseLike":false}',
    );
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-non-promise',
      toolName: 'manage',
    });
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
    const workerName = 'Async Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-delayed',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined }, ctx),
    ).resolves.toBe('async acknowledgement');

    expect(loggerErrorSpy).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-delayed',
      toolName: 'manage',
    });
  });

  it('logs async non-error rejections without crashing', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-async'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue('boom');
    const workerName = 'Async Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-async',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"workerName":"Async Worker","childThreadId":"child-thread-async","error":{"code":"unknown_error","message":"boom","retriable":false}}',
      );
    });
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-async',
      toolName: 'manage',
    });
  });

  it('logs async undefined rejections without crashing', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-undefined'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue(undefined);
    const workerName = 'Async Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-undefined',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"workerName":"Async Worker","childThreadId":"child-thread-undefined","error":{"code":"unknown_error","message":"undefined","retriable":false}}',
      );
    });
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-undefined',
      toolName: 'manage',
    });
  });

  it('logs async non-error object rejections using message field', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-object'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const diagnostic = { message: 'custom diagnostic', code: 'X' };
    const workerInvoke = vi.fn().mockRejectedValue(diagnostic);
    const workerName = 'Async Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-object',
      awaitChildResponse: vi.fn(),
      getMode: vi.fn().mockReturnValue('async'),
      getTimeoutMs: vi.fn(),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn().mockReturnValue('async acknowledgement'),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const ctx = createCtx();
    const result = await tool.execute(
      { command: 'send_message', worker: 'Async Worker', message: 'hello async', threadAlias: undefined },
      ctx,
    );

    expect(result).toBe('async acknowledgement');
    await vi.waitFor(() => {
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Manage: async send_message failed {"workerName":"Async Worker","childThreadId":"child-thread-object","error":{"code":"X","message":"custom diagnostic","retriable":false}}',
      );
    });
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-object',
      toolName: 'manage',
    });
  });

  it('rethrows non-error rejections and logs safely', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-sync'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const workerInvoke = vi.fn().mockRejectedValue('boom');
    const workerName = 'Fail Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-sync',
      awaitChildResponse: vi.fn().mockResolvedValue('ignored'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn(),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Fail Worker', message: 'fail', threadAlias: undefined }, ctx),
    ).rejects.toBe('boom');

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: send_message failed {"workerName":"Fail Worker","childThreadId":"child-thread-sync","error":{"code":"unknown_error","message":"boom","retriable":false}}',
    );
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-sync',
      toolName: 'manage',
    });
  });

  it('rethrows non-error objects while logging their message', async () => {
    const persistence = {
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('child-thread-sync-object'),
      setThreadChannelNode: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentsPersistenceService;

    const diagnostic = { message: 'sync diagnostic', code: 'Y' };
    const workerInvoke = vi.fn().mockRejectedValue(diagnostic);
    const workerName = 'Fail Worker';
    const workerAgent = { invoke: workerInvoke } as unknown as WorkerAgent;
    const manageNode = createManageNodeStub(workerName, workerAgent, {
      nodeId: 'manage-node-sync-object',
      awaitChildResponse: vi.fn().mockResolvedValue('ignored'),
      getMode: vi.fn().mockReturnValue('sync'),
      getTimeoutMs: vi.fn().mockReturnValue(64000),
      renderWorkerResponse: vi.fn(),
      renderAsyncAcknowledgement: vi.fn(),
    });

    const { tool, linking, logger } = createToolInstance(persistence, manageNode);

    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const ctx = createCtx();
    await expect(
      tool.execute({ command: 'send_message', worker: 'Fail Worker', message: 'fail', threadAlias: undefined }, ctx),
    ).rejects.toEqual(diagnostic);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Manage: send_message failed {"workerName":"Fail Worker","childThreadId":"child-thread-sync-object","error":{"code":"Y","message":"sync diagnostic","retriable":false}}',
    );
    expect(linking.registerParentToolExecution).toHaveBeenCalledWith({
      runId: ctx.runId,
      parentThreadId: 'parent-thread',
      childThreadId: 'child-thread-sync-object',
      toolName: 'manage',
    });
  });
});
