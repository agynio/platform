import { describe, it, expect, vi } from 'vitest';
import { SendMessageFunctionTool } from '../src/nodes/tools/send_message/send_message.tool';

describe('send_message tool', () => {
  type OutboxArgs = { threadId: string; text: string; source: string; runId: string | null };
  type OutboxResult = { ok: boolean; error?: string; channelMessageId?: string; threadId?: string };

  const createOutbox = (impl?: (input: OutboxArgs) => Promise<OutboxResult>) => {
    const send = vi.fn(async (input: OutboxArgs) => {
      if (impl) return impl(input);
      return { ok: true, channelMessageId: 'msg-1', threadId: input.threadId };
    });
    const outbox = ({ send } satisfies Pick<import('../src/messaging/threadOutbox.service').ThreadOutboxService, 'send'>) as import('../src/messaging/threadOutbox.service').ThreadOutboxService;
    return { outbox, send };
  };

  it('returns error when thread context is missing', async () => {
    const { outbox } = createOutbox();
    const tool = new SendMessageFunctionTool(outbox);
    const result = await tool.execute({ message: 'hello' }, {} as any);
    expect(JSON.parse(result)).toEqual({ ok: false, error: 'missing_thread_context' });
  });

  it('returns error when message is empty after trimming', async () => {
    const { outbox } = createOutbox();
    const tool = new SendMessageFunctionTool(outbox);
    const result = await tool.execute({ message: '   ' }, { threadId: 't1' });
    expect(JSON.parse(result)).toEqual({ ok: false, error: 'empty_message' });
  });

  it('delegates to ThreadOutboxService and returns serialized result', async () => {
    const { outbox, send } = createOutbox();
    const tool = new SendMessageFunctionTool(outbox);
    const outcome = await tool.execute({ message: '  hello  ' }, { threadId: 't1', runId: 'r1' });
    expect(send).toHaveBeenCalledWith({ threadId: 't1', text: 'hello', source: 'send_message', runId: 'r1' });
    expect(JSON.parse(outcome)).toEqual({ ok: true, channelMessageId: 'msg-1', threadId: 't1' });
  });

  it('returns serialized error payload when outbox throws', async () => {
    const error = new Error('channel_missing');
    const { outbox } = createOutbox(async () => {
      throw error;
    });
    const tool = new SendMessageFunctionTool(outbox);
    const response = await tool.execute({ message: 'hello' }, { threadId: 't1', runId: null });
    expect(JSON.parse(response)).toEqual({ ok: false, error: 'channel_missing' });
  });
});
