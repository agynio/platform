import { describe, it, expect } from 'vitest';
import { ChannelDescriptorSchema } from '../src/messaging/types';

describe('ChannelDescriptor validation (Slack-only)', () => {
  it('validates slack descriptor', () => {
    const ok = ChannelDescriptorSchema.safeParse({ type: 'slack', identifiers: { channelId: 'C123', threadTs: '1717' }, auth: { botToken: 'xoxb-abc' }, meta: {} });
    expect(ok.success).toBe(true);
  });
  it('rejects missing auth', () => {
    const bad = ChannelDescriptorSchema.safeParse({ type: 'slack', identifiers: { channelId: 'C123' }, meta: {} } as any);
    expect(bad.success).toBe(false);
  });
});
