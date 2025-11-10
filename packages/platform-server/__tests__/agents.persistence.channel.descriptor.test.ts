import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';

const makeService = () => {
  const prisma = createPrismaStub();
  const svc = new AgentsPersistenceService(new StubPrismaService(prisma) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
  return { prisma, svc };
};

describe('AgentsPersistenceService channel descriptor helpers', () => {
  it('stores descriptor with thread_ts for new threads', async () => {
    const { prisma, svc } = makeService();
    const threadId = await svc.getOrCreateThreadByAlias('slack', 'alias', 'summary');
    const descriptor = {
      type: 'slack' as const,
      version: 1,
      identifiers: { channel: 'C1', thread_ts: '111.222' },
      meta: { channel_type: 'channel' },
      createdBy: 'test',
    };
    await svc.updateThreadChannelDescriptor(threadId, descriptor);
    const stored = prisma._store.threads.find((t: any) => t.id === threadId);
    expect(stored?.channel).toEqual(descriptor);
  });

  it('merges thread_ts into existing descriptor without overwriting other fields', async () => {
    const { prisma, svc } = makeService();
    const threadId = await svc.getOrCreateThreadByAlias('slack', 'alias2', 'summary');
    const initial = {
      type: 'slack' as const,
      version: 1,
      identifiers: { channel: 'C2' },
      meta: { channel_type: 'im', client_msg_id: 'abc' },
      createdBy: 'SlackTrigger',
    };
    await svc.updateThreadChannelDescriptor(threadId, initial);
    const next = {
      type: 'slack' as const,
      version: 1,
      identifiers: { channel: 'C2', thread_ts: '333.444' },
      meta: { channel_type: 'im', client_msg_id: 'abc' },
      createdBy: 'SlackTrigger',
    };
    await svc.updateThreadChannelDescriptor(threadId, next);
    const stored = prisma._store.threads.find((t: any) => t.id === threadId);
    expect(stored?.channel).toEqual({
      ...initial,
      identifiers: { channel: 'C2', thread_ts: '333.444' },
    });
  });

  it('upsertThreadThreadTs patches existing descriptor without clobbering other properties', async () => {
    const { prisma, svc } = makeService();
    const threadId = await svc.getOrCreateThreadByAlias('slack', 'alias3', 'summary');
    const storedDescriptor = {
      type: 'slack' as const,
      version: 1,
      identifiers: { channel: 'C3' },
      meta: { event_ts: '999' },
      createdBy: 'SlackTrigger',
    };
    await svc.updateThreadChannelDescriptor(threadId, storedDescriptor);
    await svc.upsertThreadThreadTs(threadId, '555.666');
    const stored = prisma._store.threads.find((t: any) => t.id === threadId);
    expect(stored?.channel).toEqual({
      ...storedDescriptor,
      identifiers: { channel: 'C3', thread_ts: '555.666' },
    });
  });
});
