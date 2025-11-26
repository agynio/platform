import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { SlackAdapter } from '../src/messaging/slack/slack.adapter';

// Mock @slack/socket-mode to avoid network/real client
const socketClients: Array<{ start: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];

vi.mock('@slack/socket-mode', () => {
  class MockClient {
    public start = vi.fn(async () => {});
    public disconnect = vi.fn(async () => {});
    handlers: Record<string, Array<(...args: unknown[]) => unknown>> = {};
    on(ev: string, fn: (...args: unknown[]) => unknown) {
      this.handlers[ev] = this.handlers[ev] || [];
      this.handlers[ev].push(fn);
    }
    constructor() {
      socketClients.push({ start: this.start, disconnect: this.disconnect });
    }
  }
  return { SocketModeClient: MockClient };
});
// PRTrigger path pending refactor; mark lifecycle test skipped until clarified.

describe('SlackTrigger and PRTrigger lifecycle', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('SlackTrigger start/stop manages socket-mode lifecycle', async () => {
    const persistence = {
      getOrCreateThreadByAlias: async (_src: string, _alias: string, _summary: string) => 't-slack',
      updateThreadChannelDescriptor: async () => undefined,
    } as unknown as AgentsPersistenceService;
    const prisma = {
      getClient: () => ({
        thread: { findUnique: vi.fn(async () => ({ channel: null })) },
      }),
    } as any;
    const slackAdapter = {
      sendText: vi.fn(async () => ({ ok: true, channelMessageId: '1', threadId: '1' })),
    } as SlackAdapter;
    const trigger = new SlackTrigger(undefined as any, persistence, prisma as PrismaService, slackAdapter);
    await trigger.setConfig({ app_token: 'xapp-test', bot_token: 'xoxb-test' });
    await trigger.provision();
    await trigger.deprovision();
    expect(socketClients).toHaveLength(1);
    expect(socketClients[0].start).toHaveBeenCalledTimes(1);
    expect(socketClients[0].disconnect).toHaveBeenCalledTimes(1);
  });

  // Removed obsolete PRTrigger skipped case per Issue #572.
});
