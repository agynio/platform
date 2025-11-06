import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';

describe('AgentsPersistenceService threads filters and updates', () => {
  it('filters roots and status; updates summary/status', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    // seed
    const rootOpen = await stub.thread.create({ data: { alias: 'a1', parentId: null, summary: 'A1', status: 'open' } });
    const rootClosed = await stub.thread.create({ data: { alias: 'a2', parentId: null, summary: 'A2', status: 'closed' } });
    const child1 = await stub.thread.create({ data: { alias: 'b1', parentId: rootOpen.id, summary: 'B1', status: 'open' } });
    await stub.thread.create({ data: { alias: 'b2', parentId: rootOpen.id, summary: 'B2', status: 'closed' } });

    const allRoots = await svc.listThreads({ rootsOnly: true, status: 'all' });
    expect(allRoots.map((t) => t.id)).toEqual([rootClosed.id, rootOpen.id]);

    const openRoots = await svc.listThreads({ rootsOnly: true, status: 'open' });
    expect(openRoots).toHaveLength(1);
    expect(openRoots[0].id).toBe(rootOpen.id);

    const closedChildren = await svc.listChildren(rootOpen.id, 'closed');
    expect(closedChildren).toHaveLength(1);
    expect(closedChildren[0].parentId).toBe(rootOpen.id);

    // update
    await svc.updateThread(child1.id, { summary: 'B1x', status: 'closed' });
    const childAfter = (await svc.listChildren(rootOpen.id, 'all')).find((t) => t.id === child1.id)!;
    expect(childAfter.summary).toBe('B1x');
    expect(childAfter.status).toBe('closed');
  });
});
