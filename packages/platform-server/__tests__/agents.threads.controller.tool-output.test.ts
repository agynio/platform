import { Test } from '@nestjs/testing';
import { describe, it, expect, vi } from 'vitest';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { NotImplementedException } from '@nestjs/common';

describe('AgentsThreadsController tool output snapshot endpoint', () => {
  it('returns 501 when tool output persistence is unavailable', async () => {
    const runEventsStub = {
      isToolOutputPersistenceAvailable: vi.fn(() => false),
      getToolOutputSnapshot: vi.fn(),
    } as unknown as RunEventsService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: {} },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);

    await expect(
      ctrl.getRunEventOutput('run-1', 'event-1', { order: 'asc' } as any),
    ).rejects.toBeInstanceOf(NotImplementedException);
    expect(runEventsStub.getToolOutputSnapshot).not.toHaveBeenCalled();
  });

  it('delegates to RunEventsService when persistence is available', async () => {
    const snapshot = { items: [], terminal: null, nextSeq: null };
    const runEventsStub = {
      isToolOutputPersistenceAvailable: vi.fn(() => true),
      getToolOutputSnapshot: vi.fn(async () => snapshot),
    } as unknown as RunEventsService;

    const module = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: {} },
        { provide: ContainerThreadTerminationService, useValue: { terminateByThread: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
      ],
    }).compile();

    const ctrl = await module.resolve(AgentsThreadsController);

    const result = await ctrl.getRunEventOutput('run-1', 'event-1', { order: 'asc' } as any);
    expect(result).toBe(snapshot);
    expect(runEventsStub.getToolOutputSnapshot).toHaveBeenCalledWith({
      runId: 'run-1',
      eventId: 'event-1',
      order: 'asc',
      limit: undefined,
      sinceSeq: undefined,
    });
  });
});
