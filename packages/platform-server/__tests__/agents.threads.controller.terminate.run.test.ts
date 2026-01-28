import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { NotFoundException } from '@nestjs/common';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { RemindersService } from '../src/agents/reminders.service';

const principal = { userId: 'user-1' } as any;

const runEventsStub = {
  getRunSummary: vi.fn(),
  listRunEvents: vi.fn(),
  getEventSnapshot: vi.fn(),
  publishEvent: vi.fn(),
} as unknown as RunEventsService;

describe('AgentsThreadsController terminate run endpoint', () => {
  it('activates terminate signal when run is running', async () => {
    const activateTerminate = vi.fn();
    const persistence = {
      getRunById: vi.fn(async () => ({ id: 'run-1', threadId: 't1', status: 'running' })),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate, clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.terminateRun('run-1', principal);
    expect(res).toEqual({ ok: true });
    expect(activateTerminate).toHaveBeenCalledWith('run-1');
  });

  it('returns ok without activating when run already finished', async () => {
    const activateTerminate = vi.fn();
    const persistence = {
      getRunById: vi.fn(async () => ({ id: 'run-2', threadId: 't1', status: 'finished' })),
    } as unknown as AgentsPersistenceService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: persistence },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate, clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);
    const res = await ctrl.terminateRun('run-2', principal);
    expect(res).toEqual({ ok: true });
    expect(activateTerminate).not.toHaveBeenCalled();
  });

  it('throws NotFound when run is missing', async () => {
    const persistence = {
      getRunById: vi.fn(async () => null),
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
    await expect(ctrl.terminateRun('missing', principal)).rejects.toBeInstanceOf(NotFoundException);
  });
});
