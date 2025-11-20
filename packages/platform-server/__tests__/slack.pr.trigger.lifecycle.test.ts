import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';

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
    const persistence = { getOrCreateThreadByAlias: async (_src: string, _alias: string, _summary: string) => 't-slack' } as unknown as AgentsPersistenceService;
    const prisma = { getClient: () => ({ thread: { findUnique: async () => ({ channel: null }) } }) } as any;
    const slackAdapter = { sendText: vi.fn() } as any;
    const trigger = new SlackTrigger(logger as any, persistence, prisma, slackAdapter);
    await trigger.setConfig({ app_token: 'xapp-test', bot_token: 'xoxb-test' });
    await trigger.provision();
    await trigger.deprovision();
    expect(logger.info).toHaveBeenCalled();
  });

  // Removed obsolete PRTrigger skipped case per Issue #572.
});
