import { describe, it, expect, vi } from 'vitest';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import type { PrismaService } from '../src/core/services/prisma.service';

describe('SQL: WITH RECURSIVE and UUID casts', () => {
  it('getThreadsMetrics uses WITH RECURSIVE and ::uuid[] and returns expected aggregation', async () => {
    const captured: Array<{ strings: TemplateStringsArray; values: unknown[] }> = [];
    type FakeClient = { $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ root_id: string; reminders_count: number; containers_count: number; desc_working: boolean; self_working: boolean }>> };
    class FakePrismaService implements Pick<PrismaService, 'getClient'> {
      getClient(): FakeClient {
        return {
          async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
            captured.push({ strings, values });
            // Return one row per root
            return [
              { root_id: values[0] && Array.isArray(values[0]) ? (values[0] as string[])[0] : 'r1', reminders_count: 1, containers_count: 2, desc_working: true, self_working: false },
            ];
          },
        };
      }
    }
    const svc = new ThreadsMetricsService(new FakePrismaService() as unknown as PrismaService);
    const rootId = '11111111-1111-1111-1111-111111111111';
    const res = await svc.getThreadsMetrics([rootId]);

    // Validate SQL shape: WITH RECURSIVE and ::uuid[] cast on ids param
    expect(captured.length).toBe(1);
    const call = captured[0];
    const sql = call.strings[0].toLowerCase();
    expect(sql.includes('with recursive')).toBe(true);
    // Verify that immediately after the parameter we cast to uuid[]
    expect(call.strings[1].toLowerCase().startsWith('::uuid[]')).toBe(true);
    expect(Array.isArray(call.values[0])).toBe(true);

    // Validate aggregation mapping
    expect(res[rootId]).toBeDefined();
    expect(res[rootId].remindersCount).toBe(1);
    expect(res[rootId].activity).toBe('waiting');
    expect(res[rootId].containersCount).toBe(2);
  });

  it('scheduleThreadAndAncestorsMetrics uses WITH RECURSIVE and ::uuid and schedules returned ids', async () => {
    const root = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const parent = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const leaf = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const captured: Array<{ strings: TemplateStringsArray; values: unknown[] }> = [];
    type FakeClient2 = { $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ id: string; parentId: string | null }>> };
    class FakePrismaService2 implements Pick<PrismaService, 'getClient'> {
      getClient(): FakeClient2 {
        return {
          async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
            captured.push({ strings, values });
            return [
              { id: leaf, parentId: parent },
              { id: parent, parentId: root },
              { id: root, parentId: null },
            ];
          },
        };
      }
    }
    const prismaStub = new FakePrismaService2() as unknown as PrismaService;
    const metricsStub = { getThreadsMetrics: vi.fn(async () => ({})) };
    const runtimeStub = { subscribe: () => () => {} } as any;
    const eventsBusStub = {} as any;
    const gateway = new GraphSocketGateway(runtimeStub, metricsStub as any, prismaStub, eventsBusStub);

    const scheduled: string[] = [];
    // Spy/override scheduleThreadMetrics to capture scheduled ids
    type SchedFn = GraphSocketGateway['scheduleThreadMetrics'];
    const override = ((id: string) => { scheduled.push(id); }) satisfies SchedFn;
    // Assign using bracket notation to avoid broad casts
    (gateway as any)['scheduleThreadMetrics'] = override;

    await gateway.scheduleThreadAndAncestorsMetrics(leaf);

    expect(captured.length).toBe(1);
    const call = captured[0];
    const sql0 = call.strings[0].toLowerCase();
    expect(sql0.includes('with recursive')).toBe(true);
    expect(call.strings[1].toLowerCase().startsWith('::uuid')).toBe(true);
    expect(call.values[0]).toBe(leaf);

    // All ids from the query should be scheduled
    expect(new Set(scheduled)).toEqual(new Set([leaf, parent, root]));
  });
});
