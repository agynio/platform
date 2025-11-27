import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AgentsRemindersController } from '../src/agents/reminders.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';

const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as any;
const graphRepoStub = {
  get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
} as any;

const createLinkingStub = () =>
  ({
    buildInitialMetadata: (params: { toolName: string; parentThreadId: string; childThreadId: string }) => ({
      tool: params.toolName === 'call_engineer' ? 'call_engineer' : 'call_agent',
      parentThreadId: params.parentThreadId,
      childThreadId: params.childThreadId,
      childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
      childRunId: null,
      childRunStatus: 'queued',
      childRunLinkEnabled: false,
      childMessageId: null,
    }),
    registerParentToolExecution: async () => null,
    onChildRunStarted: async () => null,
    onChildRunMessage: async () => null,
    onChildRunCompleted: async () => null,
  }) as unknown as CallAgentLinkingService;

describe('AgentsRemindersController', () => {
  it('applies default filter, paging, and sorting', async () => {
    const svc = {
      listRemindersPaged: vi.fn(async () => ({
        total: 1,
        page: 1,
        perPage: 20,
        totalPages: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        countsByStatus: { scheduled: 1, executed: 0, cancelled: 0 },
        items: [{ id: '1' }],
      } as any)),
    } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [{ provide: AgentsPersistenceService, useValue: svc }],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const res = await ctrl.listReminders({});
    expect(svc.listRemindersPaged).toHaveBeenCalledWith('active', 1, 20, 'createdAt', 'desc', undefined);
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  it('passes explicit query params to service', async () => {
    const svc = {
      listRemindersPaged: vi.fn(async () => ({
        total: 0,
        page: 2,
        perPage: 10,
        totalPages: 0,
        sortBy: 'at',
        sortOrder: 'asc',
        countsByStatus: { scheduled: 0, executed: 0, cancelled: 0 },
        items: [],
      } as any)),
    } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [{ provide: AgentsPersistenceService, useValue: svc }],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const threadId = '11111111-1111-1111-1111-111111111111';
    await ctrl.listReminders({ filter: 'completed', page: 2, perPage: 10, sortBy: 'at', sortOrder: 'asc', threadId });
    expect(svc.listRemindersPaged).toHaveBeenCalledWith('completed', 2, 10, 'at', 'asc', threadId);
  });
});

describe('AgentsPersistenceService.listRemindersPaged', () => {
  it('builds correct where/order/take options', async () => {
    const findManyCalls: any[] = [];
    const countCalls: any[] = [];
    const countResults = [42, 5, 37, 2];
    const prismaStub = {
      getClient() {
        return {
          reminder: {
            findMany: async (args: any) => {
              findManyCalls.push(args);
              return [{ id: 'r-1' }];
            },
            count: async (args: any) => {
              countCalls.push(args);
              return countResults.shift() ?? 0;
            },
          },
        } as any;
      },
    };
    const eventsBusStub = createEventsBusStub();
    const svc = new AgentsPersistenceService(
      prismaStub as any,
      { getThreadsMetrics: async () => ({}) } as any,
      templateRegistryStub,
      graphRepoStub,
      createRunEventsStub() as any,
      createLinkingStub(),
      eventsBusStub,
    );

    const threadId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const result = await svc.listRemindersPaged('completed', 2, 10, 'at', 'asc', threadId);

    expect(findManyCalls[0]).toMatchObject({
      where: { threadId, NOT: { completedAt: null } },
      orderBy: { at: 'asc' },
      take: 10,
      skip: 10,
    });
    expect(countCalls[0]).toMatchObject({ where: { threadId, NOT: { completedAt: null } } });
    expect(countCalls[1]).toMatchObject({ where: { threadId, completedAt: null, cancelledAt: null } });
    expect(countCalls[2]).toMatchObject({ where: { threadId, NOT: { completedAt: null } } });
    expect(countCalls[3]).toMatchObject({ where: { threadId, NOT: { cancelledAt: null } } });

    expect(result.total).toBe(42);
    expect(result.totalPages).toBe(5);
    expect(result.countsByStatus).toEqual({ scheduled: 5, executed: 37, cancelled: 2 });
  });

  it('logs and rethrows prisma errors', async () => {
    const prismaStub = {
      getClient() {
        return {
          reminder: {
            findMany: async () => {
              throw new Error('db down');
            },
            count: async () => 0,
          },
        } as any;
      },
    };
    const eventsBusStub = createEventsBusStub();
    const svc = new AgentsPersistenceService(
      prismaStub as any,
      { getThreadsMetrics: async () => ({}) } as any,
      templateRegistryStub,
      graphRepoStub,
      createRunEventsStub() as any,
      createLinkingStub(),
      eventsBusStub,
    );

    const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const threadId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await expect(svc.listRemindersPaged('active', 1, 25, 'createdAt', 'desc', threadId)).rejects.toThrow('db down');
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    const message = loggerSpy.mock.calls[0]?.[0] as string;
    expect(message).toContain('Failed to list reminders (paged)');
    expect(message).toContain('"filter":"active"');
    expect(message).toContain('"threadId"');
    expect(message).toContain(threadId);

    loggerSpy.mockRestore();
  });
});
