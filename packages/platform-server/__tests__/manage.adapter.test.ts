import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ManageAdapter } from '../src/messaging/manage/manage.adapter';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { ThreadsQueryService } from '../src/threads/threads.query.service';

describe('ManageAdapter', () => {
  const PARENT_THREAD_ID = '11111111-1111-1111-8111-111111111111';
  const CHILD_THREAD_ID = '22222222-2222-4222-9222-222222222222';

  const makePrisma = (options: { parentId: string | null; alias?: string | null; channel?: unknown }) => ({
    getClient: () => ({
      thread: {
        findUnique: vi.fn(async () => ({ parentId: options.parentId, alias: options.alias ?? null, channel: options.channel ?? null })),
      },
    }),
  }) as unknown as PrismaService & {
    getClient(): { thread: { findUnique: ReturnType<typeof vi.fn> } };
  };

  const makeThreadsQuery = (overrides?: {
    getParentThreadIdAndAlias?: ReturnType<typeof vi.fn>;
    getThreadAgentTitle?: ReturnType<typeof vi.fn>;
  }) => {
    const getParentThreadIdAndAlias = overrides?.getParentThreadIdAndAlias ??
      vi.fn(async () => ({ parentThreadId: PARENT_THREAD_ID, alias: null as string | null }));
    const getThreadAgentTitle = overrides?.getThreadAgentTitle ?? vi.fn(async () => 'Worker Alpha');
    return {
      getParentThreadIdAndAlias,
      getThreadAgentTitle,
    } as unknown as ThreadsQueryService & {
      getParentThreadIdAndAlias: ReturnType<typeof vi.fn>;
      getThreadAgentTitle: ReturnType<typeof vi.fn>;
    };
  };

  let prisma: PrismaService & { getClient(): { thread: { findUnique: ReturnType<typeof vi.fn> } } };
  let threadsQuery: ThreadsQueryService & {
    getParentThreadIdAndAlias: ReturnType<typeof vi.fn>;
    getThreadAgentTitle: ReturnType<typeof vi.fn>;
  };
  let adapter: ManageAdapter;

  beforeEach(() => {
    prisma = makePrisma({ parentId: PARENT_THREAD_ID });
    threadsQuery = makeThreadsQuery();
    adapter = new ManageAdapter(prisma, threadsQuery);
  });

  it('returns error when parent thread missing', async () => {
    prisma = makePrisma({ parentId: null });
    threadsQuery = makeThreadsQuery({
      getParentThreadIdAndAlias: vi.fn(async () => ({ parentThreadId: null, alias: null })),
    });
    adapter = new ManageAdapter(prisma, threadsQuery);
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'response',
      source: 'send_message',
      runId: 'run-child',
    });
    expect(res).toEqual({ ok: false, error: 'manage_missing_parent' });
    expect(threadsQuery.getThreadAgentTitle).not.toHaveBeenCalled();
  });

  it('computes forwarded message with default prefix', async () => {
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'Work complete',
      source: 'auto_response',
      runId: 'run-child',
    });
    expect(res).toEqual({
      ok: true,
      parentThreadId: PARENT_THREAD_ID,
      forwardedText: 'From Worker Alpha: Work complete',
      agentTitle: 'Worker Alpha',
      childThreadId: CHILD_THREAD_ID,
      childThreadAlias: null,
      runId: 'run-child',
      showCorrelationInOutput: false,
    });
    expect(threadsQuery.getParentThreadIdAndAlias).toHaveBeenCalledWith(CHILD_THREAD_ID);
    expect(threadsQuery.getThreadAgentTitle).toHaveBeenCalledWith(CHILD_THREAD_ID);
  });

  it('applies asyncPrefix metadata with interpolation and correlation', async () => {
    const descriptor = {
      type: 'manage' as const,
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: {
        agentTitle: 'Worker Alpha',
        asyncPrefix: '<<{{agentTitle}}>> ',
        showCorrelationInOutput: true,
      },
      createdBy: 'manage-tool',
    };
    threadsQuery = makeThreadsQuery({
      getParentThreadIdAndAlias: vi.fn(async () => ({ parentThreadId: PARENT_THREAD_ID, alias: `manage:${PARENT_THREAD_ID}:alias-7` })),
    });
    prisma = makePrisma({ parentId: PARENT_THREAD_ID, alias: `manage:${PARENT_THREAD_ID}:alias-7`, channel: descriptor });
    adapter = new ManageAdapter(prisma, threadsQuery);
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'status update',
      source: 'auto_response',
      runId: 'run-child',
    });

    expect(res).toEqual({
      ok: true,
      parentThreadId: PARENT_THREAD_ID,
      forwardedText: `<<Worker Alpha>> [alias=alias-7; thread=${CHILD_THREAD_ID}] status update`,
      agentTitle: 'Worker Alpha',
      childThreadId: CHILD_THREAD_ID,
      childThreadAlias: 'alias-7',
      runId: 'run-child',
      showCorrelationInOutput: true,
    });
  });

  it('prefers explicit prefix argument over descriptor meta', async () => {
    const descriptor = {
      type: 'manage' as const,
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: {
        asyncPrefix: 'unused-prefix ',
        showCorrelationInOutput: true,
      },
      createdBy: 'manage-tool',
    };
    threadsQuery = makeThreadsQuery({
      getParentThreadIdAndAlias: vi.fn(async () => ({ parentThreadId: PARENT_THREAD_ID, alias: `manage:${PARENT_THREAD_ID}:alias-9` })),
    });
    prisma = makePrisma({ parentId: PARENT_THREAD_ID, alias: `manage:${PARENT_THREAD_ID}:alias-9`, channel: descriptor });
    adapter = new ManageAdapter(prisma, threadsQuery);
    const res = await adapter.computeForwardingInfo({
      childThreadId: CHILD_THREAD_ID,
      text: 'status update',
      source: 'auto_response',
      runId: 'run-child',
      prefix: '[Relay] ',
    });

    expect(res.forwardedText).toBe(`[Relay] [alias=alias-9; thread=${CHILD_THREAD_ID}] status update`);
    expect(res.showCorrelationInOutput).toBe(true);
  });
});
