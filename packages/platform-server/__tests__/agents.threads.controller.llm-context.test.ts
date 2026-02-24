import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { AgentsThreadsController } from '../src/agents/threads.controller';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';
import { RunEventsService } from '../src/events/run-events.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { RemindersService } from '../src/agents/reminders.service';

describe('AgentsThreadsController llm context endpoint', () => {
  let app: INestApplication;

  const listLlmContextItems = vi.fn(async () => ({
    items: [
      {
        rowId: 'row-1',
        idx: 3,
        isNew: false,
        contextItem: {
          id: 'ctx-1',
          role: 'user',
          contentText: 'hello',
          contentJson: null,
          metadata: null,
          sizeBytes: 5,
          createdAt: new Date('2025-12-01T00:00:00.000Z').toISOString(),
        },
      },
    ],
    nextCursor: null,
  }));
  const runEventsStub = {
    listLlmContextItems,
  } as unknown as RunEventsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentsThreadsController],
      providers: [
        { provide: AgentsPersistenceService, useValue: {} },
        { provide: ThreadCleanupCoordinator, useValue: { closeThreadWithCascade: vi.fn() } },
        { provide: RunEventsService, useValue: runEventsStub },
        { provide: RunSignalsRegistry, useValue: { register: vi.fn(), activateTerminate: vi.fn(), clear: vi.fn() } },
        { provide: LiveGraphRuntime, useValue: { getNodes: vi.fn(() => []) } },
        { provide: TemplateRegistry, useValue: { getMeta: vi.fn(() => undefined) } satisfies Pick<TemplateRegistry, 'getMeta'> },
        { provide: RemindersService, useValue: { cancelThreadReminders: vi.fn(), cancelReminder: vi.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listLlmContextItems.mockClear();
  });

  it('parses limit query values for llm context pagination', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/agents/runs/run-1/events/event-1/llm-context?limit=100',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      items: [
        {
          rowId: 'row-1',
          idx: 3,
          isNew: false,
          contextItem: { id: 'ctx-1', role: 'user' },
        },
      ],
      nextCursor: null,
    });
    expect(listLlmContextItems).toHaveBeenCalledWith({
      runId: 'run-1',
      eventId: 'event-1',
      limit: 100,
      cursor: undefined,
    });
  });
});
