import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { EventsBusService } from '../src/events/events-bus.service';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';

// Mock @slack/socket-mode to avoid network/real client
vi.mock('@slack/socket-mode', () => {
  class MockClient {
    handlers: Record<string, Array<(...args: unknown[]) => unknown>> = {};
    on(ev: string, fn: (...args: unknown[]) => unknown) {
      this.handlers[ev] = this.handlers[ev] || [];
      this.handlers[ev].push(fn);
    }
    async start() { /* no-op */ }
    async disconnect() { /* no-op */ }
    async ack(_id: string) { /* no-op */ }
  }
  return { SocketModeClient: MockClient };
});
// PRTrigger path pending refactor; mark lifecycle test skipped until clarified.

// Minimal mocks
class MockLogger {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

// New design: SlackTrigger manages its own SocketMode client with app_token.
// Mock minimal SocketModeClient behavior via module mock.

class MockGithub {
  getAuthenticatedUserLogin = vi.fn(async () => 'user');
  listAssignedOpenPullRequestsForRepo = vi.fn(async () => []);
}
class MockPRService { getPRInfo = vi.fn(async () => ({ events: [], checks: [] })); }

const nextTick = () => new Promise((res) => setTimeout(res, 0));

describe('SlackTrigger and PRTrigger lifecycle', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('SlackTrigger start/stop manages socket-mode lifecycle', async () => {
    const logger = new MockLogger() as any;
    const vault = { getSecret: async () => 'xapp-test' } as any;
    const persistence = { getOrCreateThreadByAlias: async (_src: string, _alias: string, _summary: string) => 't-slack' } as unknown as AgentsPersistenceService;
    const prisma = ({ getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } satisfies Pick<PrismaService, 'getClient'>) as PrismaService;
    const eventsBus = ({ subscribeToSlackSendRequested: vi.fn(() => () => {}) } satisfies Pick<EventsBusService, 'subscribeToSlackSendRequested'>) as EventsBusService;
    const slackAdapter = ({ sendText: vi.fn() } satisfies Pick<SlackAdapter, 'sendText'>) as SlackAdapter;
    const trigger = new SlackTrigger(logger as any, vault as any, persistence, prisma, eventsBus, slackAdapter);
    await trigger.setConfig({
      app_token: { value: 'xapp-test', source: 'static' },
      bot_token: { value: 'xoxb-test', source: 'static' },
    });
    await trigger.provision();
    await trigger.deprovision();
    expect(logger.info).toHaveBeenCalled();
  });

  // Removed obsolete PRTrigger skipped case per Issue #572.
});
