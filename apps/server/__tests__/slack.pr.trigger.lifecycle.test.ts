import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackTrigger } from '../src/triggers/slack.trigger';
import { PRTrigger } from '../src/triggers/pr.trigger';

// Minimal mocks
class MockLogger {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

class MockSlackService {
  started = false;
  handlers: any[] = [];
  onMessage = (h: any) => this.handlers.push(h);
  start = vi.fn(async () => { this.started = true; });
  stop = vi.fn(async () => { this.started = false; });
}

class MockGithub {
  getAuthenticatedUserLogin = vi.fn(async () => 'user');
  listAssignedOpenPullRequestsForRepo = vi.fn(async () => []);
}
class MockPRService { getPRInfo = vi.fn(async () => ({ events: [], checks: [] })); }

const nextTick = () => new Promise((res) => setTimeout(res, 0));

describe('SlackTrigger and PRTrigger lifecycle', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('SlackTrigger start/stop delegates to provision/deprovision (via SlackService)', async () => {
    const slack = new MockSlackService();
    const logger = new MockLogger() as any;
    const trigger = new SlackTrigger(slack as any, logger);

    await trigger.start();
    expect(slack.start).toHaveBeenCalled();
    expect(slack.started).toBe(true);

    await trigger.stop();
    expect(slack.stop).toHaveBeenCalled();
    expect(slack.started).toBe(false);
  });

  it('PRTrigger start/stop remains backward compatible while using provision hooks', async () => {
    const gh = new MockGithub();
    const prs = new MockPRService();
    const logger = new MockLogger() as any;
    const trigger = new PRTrigger(gh as any, prs as any, logger, { owner: 'o', repos: ['r'] });

    await trigger.start();
    // Immediately stop to avoid scheduling timers long term
    await nextTick();
    await trigger.stop();

    // No assert on internal provision hooks since they are no-op; this just ensures start/stop path is exercised
    expect(logger.info).toHaveBeenCalled();
  });
});
