import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { RemindersService } from '../src/agents/reminders.service';

const runEventsStub = {
  getRunSummary: async () => ({
    status: 'unknown',
    totalEvents: 0,
    firstEventAt: null,
    lastEventAt: null,
    countsByType: {
      invocation_message: 0,
      injection: 0,
      llm_call: 0,
      tool_execution: 0,
      summarization: 0,
    },
  }),
  listRunEvents: async () => ({ items: [], nextCursor: null }),
  getEventSnapshot: async () => null,
  publishEvent: async () => null,
};

describe('AgentsThreadsController PATCH threads/:id', () => {
  it('accepts null summary and toggles status', async () => {
    const updates: any[] = [];
    const closeCascade = vi.fn();
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: RunEventsService,
          useValue: runEventsStub,
        },
        {
          provide: AgentsPersistenceService,
          useValue: {
            updateThread: async (id: string, data: any) => {
              updates.push({ id, data });
              return { previousStatus: 'open', status: data.status ?? 'open' };
            },
            listThreads: async () => [],
            listRuns: async () => [],
            listRunMessages: async () => [],
            listChildren: async () => [],
          },
        },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: closeCascade } },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await ctrl.patchThread('t1', { summary: null });
    expect(closeCascade).not.toHaveBeenCalled();
    await ctrl.patchThread('t2', { status: 'closed' });

    expect(updates).toEqual([
      { id: 't1', data: { summary: null } },
      { id: 't2', data: { status: 'closed' } },
    ]);
    expect(closeCascade).toHaveBeenCalledTimes(1);
    expect(closeCascade).toHaveBeenCalledWith('t2');
  });

  it('invokes container termination when closing a thread', async () => {
    const closeCascade = vi.fn();
    const updateThread = vi.fn(async () => ({ previousStatus: 'open', status: 'closed' }));
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: AgentsPersistenceService,
          useValue: {
            updateThread,
            listThreads: async () => [],
            listRuns: async () => [],
            listRunMessages: async () => [],
            listChildren: async () => [],
          },
        },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: closeCascade } },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await ctrl.patchThread('closed-thread', { status: 'closed' });

    expect(updateThread).toHaveBeenCalledWith('closed-thread', { status: 'closed' });
    expect(closeCascade).toHaveBeenCalledWith('closed-thread');
  });

  it('does not invoke termination when status already closed', async () => {
    const closeCascade = vi.fn();
    const updateThread = vi.fn(async () => ({ previousStatus: 'closed', status: 'closed' }));
    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        {
          provide: AgentsPersistenceService,
          useValue: {
            updateThread,
            listThreads: async () => [],
            listRuns: async () => [],
            listRunMessages: async () => [],
            listChildren: async () => [],
          },
        },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: closeCascade } },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    await ctrl.patchThread('already-closed', { status: 'closed' });

    expect(closeCascade).not.toHaveBeenCalled();
  });
});
