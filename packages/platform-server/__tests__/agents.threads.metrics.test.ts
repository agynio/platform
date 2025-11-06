import { describe, it, expect } from 'vitest';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';

describe('Agents threads metrics aggregation', () => {
  it('aggregates reminders and activity across multi-level subtree', async () => {
    const stub = createPrismaStub();
    const svc = new ThreadsMetricsService(new StubPrismaService(stub) as any, { error: () => {} } as any);

    // Build thread tree: root -> child -> leaf
    const rootId = (await stub.thread.create({ data: { alias: 'root' } })).id;
    const childId = (await stub.thread.create({ data: { alias: 'child', parentId: rootId } })).id;
    const leafId = (await stub.thread.create({ data: { alias: 'leaf', parentId: childId } })).id;

    // Active run on child (descendant): should set root waiting
    await stub.run.create({ data: { threadId: childId, status: 'running' } });
    // Active reminder on leaf
    await stub.reminder.create({ data: { threadId: leafId, note: 'x', at: new Date(Date.now() + 1000), completedAt: null } });

    const metrics = await svc.getThreadsMetrics([rootId, childId, leafId]);
    expect(metrics[rootId].activity).toBe('waiting');
    expect(metrics[rootId].remindersCount).toBe(1);
    expect(metrics[childId].activity).toBe('working');
    expect(metrics[leafId].activity).toBe('waiting');
  });
});
