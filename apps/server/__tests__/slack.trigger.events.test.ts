import { describe, it, expect, vi } from 'vitest';
// Mock socket-mode client to simulate events_api envelope
vi.mock('@slack/socket-mode', () => {
  class MockClient {
    handlers: Record<string, Function[]> = {};
    on(ev: string, fn: Function) {
      this.handlers[ev] = this.handlers[ev] || [];
      this.handlers[ev].push(fn);
    }
    async start() {}
    async disconnect() {}
    async ack(_id: string) {}
  }
  return { SocketModeClient: MockClient };
});
import { SlackTrigger } from '../src/triggers/slack.trigger';

describe('SlackTrigger events', () => {
  it('relays message events from socket-mode client', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const trig = new SlackTrigger(logger);
    await trig.setConfig({ app_token: 'xapp-abc' });
    // Subscribe a listener
    const received: any[] = [];
    await trig.subscribe({ invoke: async (_t, msgs) => { received.push(...msgs); } });
    await trig.provision();
    // Fire a mock events_api envelope
    const client: any = (trig as any).client || (await (trig as any).ensureClient?.());
    const h = (client.handlers['events_api'] || [])[0];
    await h({ envelope_id: 'e1', payload: { event: { type: 'message', user: 'U', channel: 'C', text: 'hello', ts: '1.0' } } });
    expect(received.length).toBe(1);
  });

  it('fails fast when vault ref provided but vault disabled', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const trig = new SlackTrigger(logger, undefined as any);
    await expect(trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' } } as any)).rejects.toThrow();
  });

  it('resolves app token via vault during provision', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const vault = { isEnabled: () => true, getSecret: vi.fn(async () => 'xapp-from-vault') } as any;
    const trig = new SlackTrigger(logger, vault);
    await trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' } } as any);
    await trig.provision();
    expect((trig as any).client).toBeTruthy();
  });

  it('fails when resolved app token has wrong prefix', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const vault = { isEnabled: () => true, getSecret: vi.fn(async () => 'xoxb-wrong') } as any;
    const trig = new SlackTrigger(logger, vault);
    await trig.setConfig({ app_token: { value: 'secret/slack/APP', source: 'vault' } } as any);
    await trig.provision();
    expect(trig.getProvisionStatus().state).toBe('error');
  });
});
