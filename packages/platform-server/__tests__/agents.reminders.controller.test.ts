import { describe, it, expect, vi } from 'vitest';
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
  it('defaults filter=active and take=100', async () => {
    const svc = { listReminders: vi.fn(async () => [{ id: '1' }]) } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [{ provide: AgentsPersistenceService, useValue: svc }],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const res = await ctrl.listReminders({});
    expect(svc.listReminders).toHaveBeenCalledWith('active', 100, undefined);
    expect(res).toHaveProperty('items');
    expect((res as any).items).toHaveLength(1);
  });

  it('passes filter and take to service', async () => {
    const svc = { listReminders: vi.fn(async () => []) } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [{ provide: AgentsPersistenceService, useValue: svc }],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const threadId = '11111111-1111-1111-1111-111111111111';
    await ctrl.listReminders({ filter: 'completed', take: 10, threadId });
    expect(svc.listReminders).toHaveBeenCalledWith('completed', 10, threadId);
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
    await svc.listReminders('active', 20, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(captured[0]).toMatchObject({ where: { completedAt: null, cancelledAt: null }, orderBy: { at: 'asc' }, take: 50 });
    expect(captured[1]).toMatchObject({ where: { NOT: { completedAt: null } }, orderBy: { at: 'asc' }, take: 25 });
    expect(captured[2]).toMatchObject({ orderBy: { at: 'asc' }, take: 100 });
    expect(captured[2].where).toBeUndefined();
    expect(captured[3]).toMatchObject({ where: { completedAt: null, cancelledAt: null, threadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, orderBy: { at: 'asc' }, take: 20 });
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
