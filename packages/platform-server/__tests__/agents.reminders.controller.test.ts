import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgentsRemindersController, ListRemindersQueryDto } from '../src/agents/reminders.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RemindersService } from '../src/agents/reminders.service';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';

const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as any;
const graphRepoStub = {
  get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
} as any;

const createLinkingStub = () =>
  ({
    buildInitialMetadata: (params: { tool: 'call_agent' | 'call_engineer'; parentThreadId: string; childThreadId: string }) => ({
      tool: params.tool,
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
    resolveLinkedAgentNodes: async () => ({}),
  }) as unknown as CallAgentLinkingService;

function createPersistenceWithTx(tx: { reminder: { findMany: any; count: any }; $queryRaw: any }) {
  const prismaStub = {
    getClient() {
      return {
        reminder: tx.reminder,
        $queryRaw: tx.$queryRaw,
        $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      };
    },
  };

  return new AgentsPersistenceService(
    prismaStub as any,
    { getThreadsMetrics: async () => ({}) } as any,
    templateRegistryStub,
    graphRepoStub,
    createRunEventsStub() as any,
    createLinkingStub(),
    createEventsBusStub(),
  );
}

describe('AgentsRemindersController', () => {
  it('defaults filter=active and take=100 without pagination params', async () => {
    const svc = {
      listReminders: vi.fn(async () => [{ id: '1' }]),
      listRemindersPaginated: vi.fn(),
    } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [
        { provide: AgentsPersistenceService, useValue: svc },
        { provide: RemindersService, useValue: { cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const res = await ctrl.listReminders({});

    expect(svc.listReminders).toHaveBeenCalledWith('active', 100, undefined);
    expect(svc.listRemindersPaginated).not.toHaveBeenCalled();
    expect(res).toEqual({ items: [{ id: '1' }] });
  });

  it('delegates to paginated service when pagination is requested', async () => {
    const paginatedResponse = {
      items: [],
      page: 2,
      pageSize: 20,
      totalCount: 0,
      pageCount: 0,
      countsByStatus: { scheduled: 0, executed: 0, cancelled: 0 },
      sortApplied: { key: 'latest' as const, order: 'desc' as const },
    };
    const svc = {
      listReminders: vi.fn(),
      listRemindersPaginated: vi.fn(async () => paginatedResponse),
    } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [
        { provide: AgentsPersistenceService, useValue: svc },
        { provide: RemindersService, useValue: { cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const result = await ctrl.listReminders({ page: 2, threadId: 'aaaa1111-1111-1111-1111-111111111111' });

    expect(svc.listReminders).not.toHaveBeenCalled();
    expect(svc.listRemindersPaginated).toHaveBeenCalledWith({
      filter: 'all',
      page: 2,
      pageSize: 20,
      sort: 'latest',
      order: 'desc',
      threadId: 'aaaa1111-1111-1111-1111-111111111111',
    });
    expect(result).toEqual(paginatedResponse);
  });

  it('cancels a reminder via RemindersService', async () => {
    const svc = {
      listReminders: vi.fn(),
      listRemindersPaginated: vi.fn(),
    } as unknown as AgentsPersistenceService;
    const reminders = {
      cancelReminder: vi.fn(async () => ({ threadId: 'thread-9', cancelledDb: true, clearedRuntime: 1 })),
    } as unknown as RemindersService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [
        { provide: AgentsPersistenceService, useValue: svc },
        { provide: RemindersService, useValue: reminders },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const res = await ctrl.cancelReminder('rem-1');

    expect(reminders.cancelReminder).toHaveBeenCalledWith({ reminderId: 'rem-1', emitMetrics: true });
    expect(res).toEqual({ ok: true, threadId: 'thread-9' });
  });

  it('throws 404 when reminder is missing', async () => {
    const svc = {
      listReminders: vi.fn(),
      listRemindersPaginated: vi.fn(),
    } as unknown as AgentsPersistenceService;
    const reminders = {
      cancelReminder: vi.fn(async () => null),
    } as unknown as RemindersService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [
        { provide: AgentsPersistenceService, useValue: svc },
        { provide: RemindersService, useValue: reminders },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);

    await expect(ctrl.cancelReminder('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 404 when reminders service omits thread id', async () => {
    const svc = {
      listReminders: vi.fn(),
      listRemindersPaginated: vi.fn(),
    } as unknown as AgentsPersistenceService;
    const reminders = {
      cancelReminder: vi.fn(async () => ({ threadId: '', cancelledDb: true, clearedRuntime: 0 })),
    } as unknown as RemindersService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [
        { provide: AgentsPersistenceService, useValue: svc },
        { provide: RemindersService, useValue: reminders },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);

    await expect(ctrl.cancelReminder('rem-2')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ListRemindersQueryDto validation', () => {
  it('rejects page smaller than 1', async () => {
    const dto = plainToInstance(ListRemindersQueryDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.constraints).toMatchObject({ min: expect.any(String) });
  });

  it('rejects pageSize above 200', async () => {
    const dto = plainToInstance(ListRemindersQueryDto, { pageSize: 500 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.constraints).toMatchObject({ max: expect.any(String) });
  });

  it('accepts cancelled filter with pagination defaults', async () => {
    const dto = plainToInstance(ListRemindersQueryDto, { filter: 'cancelled', page: 1, pageSize: 20 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('AgentsPersistenceService.listReminders', () => {
  it('builds correct where/order/take options', async () => {
    const captured: any[] = [];
    const prismaStub = {
      getClient() {
        return {
          reminder: {
            findMany: async (args: any) => {
              captured.push(args);
              return [];
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

    await svc.listReminders('active', 50);
    await svc.listReminders('completed', 25);
    await svc.listReminders('all', 100);
    await svc.listReminders('cancelled', 30);
    await svc.listReminders('active', 20, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(captured[0]).toMatchObject({ where: { completedAt: null, cancelledAt: null }, orderBy: { at: 'asc' }, take: 50 });
    expect(captured[1]).toMatchObject({ where: { NOT: { completedAt: null } }, orderBy: { at: 'asc' }, take: 25 });
    expect(captured[2]).toMatchObject({ orderBy: { at: 'asc' }, take: 100 });
    expect(captured[2].where).toBeUndefined();
    expect(captured[3]).toMatchObject({ where: { NOT: { cancelledAt: null } }, orderBy: { at: 'asc' }, take: 30 });
    expect(captured[4]).toMatchObject({ where: { completedAt: null, cancelledAt: null, threadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, orderBy: { at: 'asc' }, take: 20 });
  });

  it('logs and rethrows prisma errors', async () => {
    const prismaStub = {
      getClient() {
        return {
          reminder: {
            findMany: async () => {
              throw new Error('db down');
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

    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(svc.listReminders('active', 5, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).rejects.toThrow('db down');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0]?.[0] as string;
    expect(message).toContain('Failed to list reminders');
    expect(message).toContain('threadId');
    expect(message).toContain('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    errorSpy.mockRestore();
  });
});

describe('AgentsPersistenceService.listRemindersPaginated', () => {
  it('coerces string pagination inputs and applies skip for latest/all path', async () => {
    const tx = {
      reminder: {
        count: vi
          .fn()
          .mockResolvedValueOnce(50)
          .mockResolvedValueOnce(30)
          .mockResolvedValueOnce(15)
          .mockResolvedValueOnce(5),
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    } as any;

    const svc = createPersistenceWithTx(tx);
    const fetchSpy = vi.spyOn(svc as any, 'fetchRemindersLatestAll').mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `rem-${index}`,
        threadId: 'thread-1',
        note: `Reminder ${index}`,
        at: new Date(),
        createdAt: new Date(),
        completedAt: null,
        cancelledAt: null,
      })),
    );

    const result = await svc.listRemindersPaginated({
      filter: 'all',
      page: '2' as unknown as number,
      pageSize: '10' as unknown as number,
      sort: 'latest',
      order: 'desc',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, clauses, skipArg, takeArg, orderArg] = fetchSpy.mock.calls[0] ?? [];
    expect(clauses).toEqual([]);
    expect(skipArg).toBe(10);
    expect(takeArg).toBe(10);
    expect(orderArg).toBe('desc');
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.totalCount).toBe(50);
    expect(result.countsByStatus).toEqual({ scheduled: 30, executed: 15, cancelled: 5 });
    expect(tx.reminder.findMany).not.toHaveBeenCalled();
  });

  it('uses prisma pagination branch for non-latest filters with coerced values', async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      id: `completed-${index}`,
      threadId: 'thread-1',
      note: `Completed ${index}`,
      at: new Date(),
      createdAt: new Date(),
      completedAt: new Date(),
      cancelledAt: null,
    }));

    const tx = {
      reminder: {
        count: vi
          .fn()
          .mockResolvedValueOnce(42)
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(18)
          .mockResolvedValueOnce(7),
        findMany: vi.fn().mockResolvedValue(items),
      },
      $queryRaw: vi.fn(),
    } as any;

    const svc = createPersistenceWithTx(tx);
    const result = await svc.listRemindersPaginated({
      filter: 'completed',
      page: '3' as unknown as number,
      pageSize: '5' as unknown as number,
      sort: 'createdAt',
      order: 'asc',
    });

    expect(tx.reminder.findMany).toHaveBeenCalledWith({
      where: { completedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
      skip: 10,
      take: 5,
      select: {
        id: true,
        threadId: true,
        note: true,
        at: true,
        createdAt: true,
        completedAt: true,
        cancelledAt: true,
      },
    });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(5);
    expect(result.items).toHaveLength(5);
    expect(result.countsByStatus).toEqual({ scheduled: 12, executed: 18, cancelled: 7 });
  });
});

describe('AgentsPersistenceService.listRemindersPaginated', () => {
  it('applies pagination and ordering with prisma findMany', async () => {
    const findMany = vi.fn(async () => [
      {
        id: 'rem-1',
        threadId: 'thread-1',
        note: 'note',
        at: new Date(),
        createdAt: new Date(),
        completedAt: null,
        cancelledAt: null,
      },
    ]);
    const count = vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      if (where && 'completedAt' in where && where.completedAt === null && 'cancelledAt' in where && where.cancelledAt === null) {
        return 25;
      }
      if (where && 'completedAt' in where && typeof where.completedAt === 'object' && where.completedAt && 'not' in where.completedAt) {
        return 6;
      }
      if (where && 'cancelledAt' in where && typeof where.cancelledAt === 'object' && where.cancelledAt && 'not' in where.cancelledAt) {
        return 4;
      }
      return 0;
    });
    const queryRaw = vi.fn();
    const svc = createPersistenceWithTx({ reminder: { findMany, count }, $queryRaw: queryRaw });

    const result = await svc.listRemindersPaginated({ filter: 'active', page: 2, pageSize: 10, sort: 'createdAt', order: 'asc' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { completedAt: null, cancelledAt: null },
        orderBy: { createdAt: 'asc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(queryRaw).not.toHaveBeenCalled();
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.totalCount).toBe(25);
    expect(result.pageCount).toBe(Math.ceil(25 / 10));
    expect(result.countsByStatus).toEqual({ scheduled: 25, executed: 6, cancelled: 4 });
    expect(result.sortApplied).toEqual({ key: 'createdAt', order: 'asc' });
    expect(result.items).toHaveLength(1);
  });

  it('uses raw query for latest sorting when filter is all', async () => {
    const findMany = vi.fn();
    const count = vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      if (!where) return 42;
      if (where && 'completedAt' in where && where.completedAt === null && 'cancelledAt' in where && where.cancelledAt === null) {
        return 10;
      }
      if (where && 'completedAt' in where && typeof where.completedAt === 'object' && where.completedAt && 'not' in where.completedAt) {
        return 8;
      }
      if (where && 'cancelledAt' in where && typeof where.cancelledAt === 'object' && where.cancelledAt && 'not' in where.cancelledAt) {
        return 6;
      }
      return 0;
    });
    const queryRaw = vi.fn(async () => [
      {
        id: 'rem-raw',
        threadId: 'thread-raw',
        note: 'raw',
        at: new Date(),
        createdAt: new Date(),
        completedAt: new Date(),
        cancelledAt: null,
      },
    ]);
    const svc = createPersistenceWithTx({ reminder: { findMany, count }, $queryRaw: queryRaw });

    const result = await svc.listRemindersPaginated({ filter: 'all', page: 1, pageSize: 5, sort: 'latest', order: 'desc' });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
    expect(result.totalCount).toBe(42);
    expect(result.pageCount).toBe(Math.ceil(42 / 5));
    expect(result.countsByStatus).toEqual({ scheduled: 10, executed: 8, cancelled: 6 });
    expect(result.items).toHaveLength(1);
    expect(result.sortApplied).toEqual({ key: 'latest', order: 'desc' });
  });
});
