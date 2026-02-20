import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreModule } from '../src/core/core.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationsPublisher } from '../src/notifications/notifications.publisher';
import { NotificationsBroker } from '../src/notifications/notifications.broker';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { EventsBusService } from '../src/events/events-bus.service';
import type { EnvSnapshot } from './notifications.test-helpers';
import { initNotificationsConfig, resetNotificationsConfig } from './notifications.test-helpers';

const createStubModule = vi.hoisted(() => {
  return (name: string): unknown => {
    class NamedModule {}
    Module({})(NamedModule);
    Object.defineProperty(NamedModule, 'name', { value: name });
    return NamedModule;
  };
});

vi.mock('../src/graph/graph-api.module', () => ({
  GraphApiModule: createStubModule('GraphApiModuleStub'),
}));

vi.mock('../src/events/events.module', () => ({
  EventsModule: createStubModule('EventsModuleStub'),
}));

class RedisStub {
  connect = vi.fn(async () => {});
  publish = vi.fn(async () => 1);
  quit = vi.fn(async () => {});
}

const redisFactory = vi.fn(() => new RedisStub());

vi.mock('ioredis', () => ({
  default: vi.fn((...args: unknown[]) => redisFactory(...args)),
}));

const createEventsBusStub = (): EventsBusService => {
  const disposer = () => vi.fn();
  return {
    subscribeToRunEvents: () => disposer(),
    subscribeToToolOutputChunk: () => disposer(),
    subscribeToToolOutputTerminal: () => disposer(),
    subscribeToReminderCount: () => disposer(),
    subscribeToNodeState: () => disposer(),
    subscribeToThreadCreated: () => disposer(),
    subscribeToThreadUpdated: () => disposer(),
    subscribeToMessageCreated: () => disposer(),
    subscribeToRunStatusChanged: () => disposer(),
    subscribeToThreadMetrics: () => disposer(),
    subscribeToThreadMetricsAncestors: () => disposer(),
    emitToolOutputChunk: vi.fn(),
    emitToolOutputTerminal: vi.fn(),
    emitReminderCount: vi.fn(),
    emitNodeState: vi.fn(),
    emitThreadCreated: vi.fn(),
    emitThreadUpdated: vi.fn(),
    emitMessageCreated: vi.fn(),
    emitRunStatusChanged: vi.fn(),
  } as unknown as EventsBusService;
};

const runtimeRef: { current: LiveGraphRuntime | null } = { current: null };
const metricsRef: { current: ThreadsMetricsService | null } = { current: null };
const prismaRef: { current: PrismaService | null } = { current: null };
const eventsBusRef: { current: EventsBusService | null } = { current: null };

@Global()
@Module({
  providers: [
    { provide: LiveGraphRuntime, useFactory: () => runtimeRef.current },
    { provide: ThreadsMetricsService, useFactory: () => metricsRef.current },
    { provide: PrismaService, useFactory: () => prismaRef.current },
    { provide: EventsBusService, useFactory: () => eventsBusRef.current },
  ],
  exports: [LiveGraphRuntime, ThreadsMetricsService, PrismaService, EventsBusService],
})
class NotificationsTestOverridesModule {}

describe('NotificationsModule bootstrap', () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = initNotificationsConfig();
    redisFactory.mockImplementation(() => new RedisStub());
  });

  afterEach(async () => {
    resetNotificationsConfig(envSnapshot);
    runtimeRef.current = null;
    metricsRef.current = null;
    prismaRef.current = null;
    eventsBusRef.current = null;
    vi.clearAllMocks();
  });

  it('initializes the module and connects the broker', async () => {
    const runtimeStub = { subscribe: vi.fn(() => () => {}) } as unknown as LiveGraphRuntime;
    const metricsStub = { getThreadsMetrics: vi.fn(async () => ({})) } as unknown as ThreadsMetricsService;
    const prismaStub = {
      getClient: () => ({ $queryRaw: vi.fn().mockResolvedValue([]) }),
    } as unknown as PrismaService;
    const eventsBusStub = createEventsBusStub();
    runtimeRef.current = runtimeStub;
    metricsRef.current = metricsStub;
    prismaRef.current = prismaStub;
    eventsBusRef.current = eventsBusStub;

    const testingModule = await Test.createTestingModule({
      imports: [CoreModule, NotificationsTestOverridesModule, NotificationsModule],
    }).compile();

    const broker = testingModule.get(NotificationsBroker);
    const connectSpy = vi.spyOn(broker, 'connect');

    await testingModule.init();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(redisFactory).toHaveBeenCalledWith('redis://localhost:6379/0', expect.objectContaining({ lazyConnect: true }));

    const publisher = testingModule.get(NotificationsPublisher);
    expect(publisher).toBeInstanceOf(NotificationsPublisher);

    await testingModule.close();
  });
});
