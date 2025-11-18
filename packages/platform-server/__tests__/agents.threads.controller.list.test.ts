import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { RunEventsService } from '../src/events/run-events.service';

const runEventsStub = {
  getRunSummary: vi.fn(async () => null),
  listRunEvents: vi.fn(async () => []),
} as unknown as RunEventsService;

describe('AgentsThreadsController list endpoints', () => {
  it('requests metrics and agent titles when flags are enabled', async () => {
    const now = new Date();
    const persistence = {
      listThreads: vi.fn(async () => [
        { id: 't1', alias: 'a1', summary: 'Summary', status: 'open', createdAt: now, parentId: null },
      ]),
      getThreadsMetrics: vi.fn(async () => ({ t1: { remindersCount: 5, containersCount: 1, activity: 'working', runsCount: 2 } })),
      getThreadsAgentTitles: vi.fn(async () => ({ t1: 'Agent One' })),
      listChildren: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.listThreads({ includeMetrics: 'true', includeAgentTitles: 'true' } as any);

    expect((persistence.listThreads as any).mock.calls.length).toBe(1);
    expect((persistence.getThreadsMetrics as any).mock.calls[0][0]).toEqual(['t1']);
    expect((persistence.getThreadsAgentTitles as any).mock.calls[0][0]).toEqual(['t1']);
    expect(res).toMatchObject({
      items: [
        {
          id: 't1',
          alias: 'a1',
          summary: 'Summary',
          status: 'open',
          parentId: null,
          metrics: { remindersCount: 5, containersCount: 1, activity: 'working', runsCount: 2 },
          agentTitle: 'Agent One',
        },
      ],
    });
    expect(res.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('fills defaults when service omits metrics or titles for children', async () => {
    const now = new Date();
    const persistence = {
      listChildren: vi.fn(async () => [
        { id: 'c1', alias: 'child', summary: null, status: 'open', createdAt: now, parentId: 't1' },
      ]),
      getThreadsMetrics: vi.fn(async () => ({})),
      getThreadsAgentTitles: vi.fn(async () => ({})),
      listThreads: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.listChildren('t1', { includeMetrics: 'true', includeAgentTitles: 'true' } as any);

    expect(res.items[0].metrics).toEqual({ remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 });
    expect(res.items[0].agentTitle).toBe('(unknown agent)');
  });

  it('getThreadMetrics returns default metrics including runsCount when missing', async () => {
    const persistence = {
      getThreadsMetrics: vi.fn(async () => ({})),
      listThreads: vi.fn(),
      listChildren: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
      getThreadsAgentTitles: vi.fn(),
      getThreadById: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.getThreadMetrics('t-miss');
    expect(res).toEqual({ remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 });
  });

  it('getThread returns defaults for metrics and titles when missing', async () => {
    const now = new Date();
    const persistence = {
      getThreadById: vi.fn(async (_id: string, opts: { includeMetrics?: boolean; includeAgentTitles?: boolean }) => {
        expect(opts).toEqual({ includeMetrics: true, includeAgentTitles: true });
        return {
          id: 't1',
          alias: 'alias',
          summary: null,
          status: 'open',
          createdAt: now,
          parentId: null,
          metrics: undefined,
          agentTitle: undefined,
        };
      }),
      listThreads: vi.fn(),
      listChildren: vi.fn(),
      getThreadsMetrics: vi.fn(),
      getThreadsAgentTitles: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const result = await ctrl.getThread('t1', { includeMetrics: 'true', includeAgentTitles: 'true' } as any);

    expect(result).toMatchObject({
      id: 't1',
      alias: 'alias',
      parentId: null,
      metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
      agentTitle: '(unknown agent)',
    });
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('getThread throws when persistence returns null', async () => {
    const persistence = {
      getThreadById: vi.fn(async () => null),
      listThreads: vi.fn(),
      listChildren: vi.fn(),
      getThreadsMetrics: vi.fn(),
      getThreadsAgentTitles: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await expect(ctrl.getThread('missing', {} as any)).rejects.toThrowError('thread_not_found');
  });
});
