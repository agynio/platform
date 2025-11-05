import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';

describe('AgentsThreadsController PATCH threads/:id', () => {
  it('accepts null summary and toggles status', async () => {
    const updates: any[] = [];
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: (await import('../src/agents/agents.persistence.service')).AgentsPersistenceService,
          useValue: {
            updateThread: async (id: string, data: any) => updates.push({ id, data }),
            listThreads: async () => [],
            listRuns: async () => [],
            listRunMessages: async () => [],
            listChildren: async () => [],
          },
        },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await ctrl.patchThread('t1', { summary: null });
    await ctrl.patchThread('t2', { status: 'closed' });

    expect(updates).toEqual([
      { id: 't1', data: { summary: null } },
      { id: 't2', data: { status: 'closed' } },
    ]);
  });
});

