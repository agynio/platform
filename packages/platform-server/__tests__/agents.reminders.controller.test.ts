import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsRemindersController } from '../src/agents/reminders.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

describe('AgentsRemindersController', () => {
  it('defaults filter=active and take=100', async () => {
    const svc = { listReminders: vi.fn(async () => [{ id: '1' }]) } as unknown as AgentsPersistenceService;
    const module = await Test.createTestingModule({
      controllers: [AgentsRemindersController],
      providers: [{ provide: AgentsPersistenceService, useValue: svc }],
    }).compile();

    const ctrl = await module.resolve(AgentsRemindersController);
    const res = await ctrl.listReminders({});
    expect(svc.listReminders).toHaveBeenCalledWith('active', 100);
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
    await ctrl.listReminders({ filter: 'completed', take: 10 });
    expect(svc.listReminders).toHaveBeenCalledWith('completed', 10);
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
    const svc = new AgentsPersistenceService(prismaStub as any);

    await svc.listReminders('active', 50);
    await svc.listReminders('completed', 25);
    await svc.listReminders('all', 100);

    expect(captured[0]).toMatchObject({ where: { completedAt: null }, orderBy: { at: 'desc' }, take: 50 });
    expect(captured[1]).toMatchObject({ where: { NOT: { completedAt: null } }, orderBy: { at: 'desc' }, take: 25 });
    expect(captured[2]).toMatchObject({ where: undefined, orderBy: { at: 'desc' }, take: 100 });
  });
});

