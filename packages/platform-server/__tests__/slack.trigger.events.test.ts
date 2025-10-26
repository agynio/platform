import { describe, it, expect, vi } from 'vitest';
import type { LoggerService } from '../src/core/services/logger.service.js';
// BaseTrigger legacy removed in Issue #451; use SlackTrigger semantics only
// Mock socket-mode client; SlackTrigger registers a 'message' handler
vi.mock('@slack/socket-mode', () => {
  let last: MockClient | null = null;
  class MockClient {
    handlers: Record<string, Function[]> = {};
    constructor() { last = this; }
    on(ev: string, fn: Function) {
      this.handlers[ev] = this.handlers[ev] || [];
      this.handlers[ev].push(fn);
    }
    async start() {}
    async disconnect() {}
  }
  const __getLastSocketClient = () => last;
  return { SocketModeClient: MockClient, __getLastSocketClient };
});
// Type augmentation for mocked helper
declare module '@slack/socket-mode' {
  export function __getLastSocketClient(): { handlers: Record<string, Function[]> } | null;
}
import { SlackTrigger } from '../src/nodes/slackTrigger/slackTrigger.node';
import { __getLastSocketClient } from '@slack/socket-mode';

describe('SlackTrigger events', () => {
  const makeLogger = (): Pick<LoggerService, 'info' | 'debug' | 'error'> => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  });

  // Typed helper for Slack socket-mode envelope used by our handler
  type SlackEnvelope = {
    envelope_id: string;
    ack: () => Promise<void>;
    body: {
      type: 'event_callback';
      event: { type: 'message'; user: string; channel: string; text: string; ts: string };
    };
  };

  it('relays message events from socket-mode client', async () => {
    const logger = makeLogger();
    const trig = new SlackTrigger(logger as unknown as LoggerService);
    await trig.setConfig({ app_token: 'xapp-abc' });
    // Subscribe a listener
    const received: TriggerMessage[] = [];
    await trig.subscribe({ invoke: async (_t, msgs) => { received.push(...msgs); } });
    await trig.provision();
    // Fire a mock socket-mode 'message' envelope.
    const client = __getLastSocketClient();
    if (!client) throw new Error('Mock SocketMode client not initialized');
    const h = (client.handlers['message'] || [])[0] as (env: SlackEnvelope) => Promise<void> | void;
    const ack = vi.fn<[], Promise<void>>(async () => {});
    const env: SlackEnvelope = {
      envelope_id: 'e1',
      ack,
      body: {
        type: 'event_callback',
        event: { type: 'message', user: 'U', channel: 'C', text: 'hello', ts: '1.0' },
      },
    };
    await h(env);
    expect(received.length).toBe(1);
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('fails fast when vault ref provided but vault disabled', async () => {
    const logger = makeLogger();
    const trig = new SlackTrigger(logger as unknown as LoggerService, undefined);
    await expect(trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' } })).rejects.toThrow();
  });

  it('resolves app token via vault during provision', async () => {
    const logger = makeLogger();
    const vault: { isEnabled: () => boolean; getSecret: (ref: any) => Promise<string> } = {
      isEnabled: () => true,
      getSecret: vi.fn(async () => 'xapp-from-vault'),
    };
    const trig = new SlackTrigger(logger as unknown as LoggerService, vault as unknown as any);
    await trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' } });
    await trig.provision();
    // Ensure a client was created by the trigger
    expect(__getLastSocketClient()).toBeTruthy();
  });

  it('fails when resolved app token has wrong prefix', async () => {
    const logger = makeLogger();
    const vault: { isEnabled: () => boolean; getSecret: (ref: any) => Promise<string> } = {
      isEnabled: () => true,
      getSecret: vi.fn(async () => 'xoxb-wrong'),
    };
    const trig = new SlackTrigger(logger as unknown as LoggerService, vault as unknown as any);
    await trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' } });
    await trig.provision();
    expect(trig.getProvisionStatus().state).toBe('error');
  });
});
