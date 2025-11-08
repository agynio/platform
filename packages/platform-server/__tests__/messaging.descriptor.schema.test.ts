import { describe, it, expect } from 'vitest';
import { ChannelDescriptorSchema } from '../src/messaging/types';

describe('ChannelDescriptor validation (Slack-only)', () => {
  it('validates slack descriptor', () => {
    const ok = ChannelDescriptorSchema.safeParse({ type: 'slack', version: 1, identifiers: { channel: 'C123', thread_ts: '1717' }, meta: {} });
    expect(ok.success).toBe(true);
  });
  it('validates slack descriptor without thread_ts', () => {
    const ok = ChannelDescriptorSchema.safeParse({ type: 'slack', version: 1, identifiers: { channel: 'C123' }, meta: {} });
    expect(ok.success).toBe(true);
  });
  it('rejects missing version', () => {
    const bad = ChannelDescriptorSchema.safeParse({ type: 'slack', identifiers: { channel: 'C123' }, meta: {} } as any);
    expect(bad.success).toBe(false);
  });
});
