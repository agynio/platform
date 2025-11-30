import { describe, expect, it, vi } from 'vitest';
import { ChannelRouter } from '../src/messaging/channelRouter.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import type { ManageAdapter } from '../src/messaging/manage/manage.adapter';
import type { AgentIngressService } from '../src/messaging/manage/agentIngress.service';
import type { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import type { ThreadsQueryService } from '../src/threads/threads.query.service';

describe('ChannelRouter manage routes', () => {
  const PARENT_THREAD_ID = '11111111-1111-1111-8111-111111111111';
  const CHILD_THREAD_ID = '22222222-2222-4222-9222-222222222222';

  const makePrisma = (descriptor: unknown) => ({
    getClient: () => ({
      thread: {
        findUnique: vi.fn(async () => ({ channel: descriptor, channelNodeId: null })),
      },
    }),
  }) as unknown as PrismaService & { getClient(): { thread: { findUnique: ReturnType<typeof vi.fn> } } };

  const makeSlack = () => ({ sendText: vi.fn() }) as unknown as SlackAdapter & { sendText: ReturnType<typeof vi.fn> };
  const makeManage = () => ({ computeForwardingInfo: vi.fn() }) as unknown as ManageAdapter & {
    computeForwardingInfo: ReturnType<typeof vi.fn>;
  };
  const makeIngress = () => ({ enqueueToAgent: vi.fn() }) as unknown as AgentIngressService & {
    enqueueToAgent: ReturnType<typeof vi.fn>;
  };
  const makeRuntime = (instance?: unknown) =>
    ({
      getNodeInstance: vi.fn(() => instance),
    }) as unknown as LiveGraphRuntime & { getNodeInstance: ReturnType<typeof vi.fn> };
  const makeThreadsQuery = () =>
    ({
      getParentThreadIdAndAlias: vi.fn(async () => ({ parentThreadId: PARENT_THREAD_ID, alias: 'alias-1' })),
    }) as unknown as ThreadsQueryService & {
      getParentThreadIdAndAlias: ReturnType<typeof vi.fn>;
    };

  it('returns ok without forwarding for sync mode', async () => {
    const descriptor = {
      type: 'manage' as const,
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: { mode: 'sync' as const },
      createdBy: 'manage-tool',
    };
    const prisma = makePrisma(descriptor);
    const slack = makeSlack();
    const runtime = makeRuntime(slack);
    const manage = makeManage();
    const ingress = makeIngress();
    const threadsQuery = makeThreadsQuery();

    const router = new ChannelRouter(prisma, runtime, manage, ingress, threadsQuery);
    const adapter = await router.getAdapter(CHILD_THREAD_ID);
    expect(adapter).not.toBeNull();
    const res = await adapter!.sendText({
      threadId: CHILD_THREAD_ID,
      text: 'child response',
      source: 'auto_response',
      runId: 'child-run',
    });

    expect(res).toEqual({ ok: true });
    expect(manage.computeForwardingInfo).not.toHaveBeenCalled();
    expect(ingress.enqueueToAgent).not.toHaveBeenCalled();
    expect(slack.sendText).not.toHaveBeenCalled();
    expect(runtime.getNodeInstance).not.toHaveBeenCalled();
  });

  it('delegates to agent ingress for async mode', async () => {
    const descriptor = {
      type: 'manage' as const,
      version: 1,
      identifiers: { parentThreadId: PARENT_THREAD_ID },
      meta: { mode: 'async' as const },
      createdBy: 'manage-tool',
    };
    const prisma = makePrisma(descriptor);
    const slack = makeSlack();
    const runtime = makeRuntime(slack);
    const manage = makeManage();
    manage.computeForwardingInfo.mockResolvedValue({
      ok: true,
      parentThreadId: PARENT_THREAD_ID,
      forwardedText: 'From Worker Alpha: hello',
      agentTitle: 'Worker Alpha',
      childThreadId: CHILD_THREAD_ID,
      childThreadAlias: 'alias-1',
      runId: 'child-run',
      showCorrelationInOutput: true,
    });
    const ingress = makeIngress();
    ingress.enqueueToAgent.mockResolvedValue({ ok: true });
    const threadsQuery = makeThreadsQuery();

    const router = new ChannelRouter(prisma, runtime, manage, ingress, threadsQuery);
    const adapter = await router.getAdapter(CHILD_THREAD_ID);
    expect(adapter).not.toBeNull();

    const res = await adapter!.sendText({
      threadId: CHILD_THREAD_ID,
      text: 'hello',
      source: 'auto_response',
      runId: 'child-run',
    });

    expect(res).toEqual({ ok: true });
    expect(manage.computeForwardingInfo).toHaveBeenCalledWith({
      childThreadId: CHILD_THREAD_ID,
      text: 'hello',
      source: 'auto_response',
      runId: 'child-run',
      prefix: undefined,
      parentThreadId: PARENT_THREAD_ID,
      childThreadAlias: 'alias-1',
    });
    expect(ingress.enqueueToAgent).toHaveBeenCalledWith({
      parentThreadId: PARENT_THREAD_ID,
      text: 'From Worker Alpha: hello',
      childThreadId: CHILD_THREAD_ID,
      childThreadAlias: 'alias-1',
      agentTitle: 'Worker Alpha',
      runId: 'child-run',
      showCorrelationInOutput: true,
    });
    expect(slack.sendText).not.toHaveBeenCalled();
    expect(runtime.getNodeInstance).not.toHaveBeenCalled();
  });
});
