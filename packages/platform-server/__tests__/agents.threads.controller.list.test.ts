import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { RemindersService } from '../src/agents/reminders.service';

const runEventsStub = {
  getRunSummary: vi.fn(async () => null),
  listRunEvents: vi.fn(async () => []),
} as unknown as RunEventsService;

const principal = { userId: 'user-1' } as any;

describe('AgentsThreadsController list endpoints', () => {
  it('requests metrics and agent titles when flags are enabled', async () => {
    const now = new Date();
    const persistence = {
      listThreads: vi.fn(async () => [
        { id: 't1', alias: 'a1', summary: 'Summary', status: 'open', createdAt: now, parentId: null },
      ]),
      getThreadsMetrics: vi.fn(async () => ({ t1: { remindersCount: 5, containersCount: 1, activity: 'working', runsCount: 2 } })),
      getThreadsAgentDescriptors: vi.fn(async () => ({ t1: { title: 'Agent One', role: 'Planner', name: 'Alpha' } })),
      listChildren: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.listThreads({ includeMetrics: 'true', includeAgentTitles: 'true' } as any, principal);

    expect(persistence.listThreads).toHaveBeenCalledWith({ rootsOnly: false, status: 'all', limit: 100, ownerUserId: principal.userId });
    expect((persistence.getThreadsMetrics as any).mock.calls[0][0]).toEqual(['t1']);
    expect((persistence.getThreadsAgentDescriptors as any).mock.calls[0][0]).toEqual(['t1']);
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
          agentRole: 'Planner',
          agentName: 'Alpha',
        },
      ],
    });
    expect(res.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('includes agentRole without requiring metrics or titles flags', async () => {
    const now = new Date();
    const persistence = {
      listThreads: vi.fn(async () => [
        { id: 't1', alias: 'a1', summary: 'Summary', status: 'open', createdAt: now, parentId: null },
      ]),
      getThreadsAgentDescriptors: vi.fn(async () => ({ t1: { title: 'Agent One', role: 'Support', name: 'Beta' } })),
      getThreadsMetrics: vi.fn(),
      listChildren: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.listThreads({} as any, principal);

    expect((persistence.getThreadsMetrics as any).mock?.calls?.length ?? 0).toBe(0);
    expect(res.items[0]).toMatchObject({ agentRole: 'Support', agentName: 'Beta' });
    expect(res.items[0]).not.toHaveProperty('agentTitle');
    expect(res.items[0]).not.toHaveProperty('metrics');
  });

  it('fills defaults when service omits metrics or titles for children', async () => {
    const now = new Date();
    const persistence = {
      listChildren: vi.fn(async () => [
        { id: 'c1', alias: 'child', summary: null, status: 'open', createdAt: now, parentId: 't1' },
      ]),
      getThreadsMetrics: vi.fn(async () => ({})),
      getThreadsAgentDescriptors: vi.fn(async () => ({})),
      listThreads: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
      getThreadById: vi.fn(async () => ({ id: 't1', ownerUserId: principal.userId })),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.listChildren('t1', { includeMetrics: 'true', includeAgentTitles: 'true' } as any, principal);

    expect(res.items[0].metrics).toEqual({ remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 });
    expect(res.items[0].agentTitle).toBe('(unknown agent)');
    expect(res.items[0].agentRole).toBeUndefined();
    expect(res.items[0].agentName).toBeUndefined();
  });

  it('listChildren forwards agent name and role descriptors', async () => {
    const now = new Date();
    const persistence = {
      listChildren: vi.fn(async () => [
        { id: 'c2', alias: 'child', summary: null, status: 'open', createdAt: now, parentId: 't1' },
      ]),
      getThreadsAgentDescriptors: vi.fn(async () => ({ c2: { title: 'Agent Child', role: 'Helper', name: 'Child' } })),
      getThreadsMetrics: vi.fn(async () => ({})),
      listThreads: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
      getThreadById: vi.fn(async () => ({ id: 't1', ownerUserId: principal.userId })),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.listChildren('t1', {} as any, principal);

    expect(res.items[0]).toMatchObject({ agentName: 'Child', agentRole: 'Helper' });
    expect(res.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('getThreadMetrics returns default metrics including runsCount when missing', async () => {
    const persistence = {
      getThreadsMetrics: vi.fn(async () => ({})),
      listThreads: vi.fn(),
      listChildren: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
      getThreadsAgentDescriptors: vi.fn(),
      getThreadById: vi.fn(async () => ({ id: 't-miss', ownerUserId: principal.userId })),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.getThreadMetrics('t-miss', principal);
    expect(res).toEqual({ remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 });
  });

  it('getThread returns defaults for metrics and titles when missing', async () => {
    const now = new Date();
    const persistence = {
      getThreadById: vi.fn(async (_id: string, opts: { includeMetrics?: boolean; includeAgentTitles?: boolean; ownerUserId?: string }) => {
        expect(opts).toEqual({ includeMetrics: true, includeAgentTitles: true, ownerUserId: principal.userId });
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
      getThreadsAgentDescriptors: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const result = await ctrl.getThread('t1', { includeMetrics: 'true', includeAgentTitles: 'true' } as any, principal);

    expect(result).toMatchObject({
      id: 't1',
      alias: 'alias',
      parentId: null,
      metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
      agentTitle: '(unknown agent)',
    });
    expect(result.agentName).toBeUndefined();
    expect(result.agentRole).toBeUndefined();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('getThread forwards agent name and role without optional flags', async () => {
    const now = new Date();
    const persistence = {
      getThreadById: vi.fn(async (_id: string, opts: { ownerUserId?: string }) => ({
        id: 't2',
        alias: 'alias',
        summary: 'Summary',
        status: 'open',
        createdAt: now,
        parentId: null,
        agentName: 'Agent X',
        agentRole: 'Planner',
        ownerUserId: opts.ownerUserId,
      })),
      listThreads: vi.fn(),
      listChildren: vi.fn(),
      getThreadsMetrics: vi.fn(),
      getThreadsAgentDescriptors: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const result = await ctrl.getThread('t2', {} as any, principal);

    expect(result).toMatchObject({ agentName: 'Agent X', agentRole: 'Planner' });
  });

  it('getThread throws when persistence returns null', async () => {
    const persistence = {
      getThreadById: vi.fn(async () => null),
      listThreads: vi.fn(),
      listChildren: vi.fn(),
      getThreadsMetrics: vi.fn(),
      getThreadsAgentDescriptors: vi.fn(),
      listRuns: vi.fn(),
      listRunMessages: vi.fn(),
      updateThread: vi.fn(),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await expect(ctrl.getThread('missing', {} as any, principal)).rejects.toThrow(NotFoundException);
  });

});
