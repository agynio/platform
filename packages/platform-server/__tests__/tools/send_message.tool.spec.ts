import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { SendMessageFunctionTool } from '../../src/nodes/tools/send_message/send_message.tool';
import type { ThreadTransportService } from '../../src/messaging/threadTransport.service';
import type { LLMContext } from '../../src/llm/types';

const createCtx = (threadId?: string, runId: string = 'run-1'): LLMContext => ({
  threadId,
  runId,
} as unknown as LLMContext);

describe('SendMessageFunctionTool', () => {
  it('delegates to ThreadTransportService', async () => {
    const transport = { sendTextToThread: vi.fn().mockResolvedValue({ ok: true, threadId: 'thread-1' }) } as unknown as ThreadTransportService;
    const tool = new SendMessageFunctionTool(transport);

    const output = await tool.execute({ message: 'hello' }, createCtx('thread-1'));

    expect(transport.sendTextToThread).toHaveBeenCalledWith('thread-1', 'hello', {
      runId: 'run-1',
      source: 'send_message',
    });
    expect(output).toBe('message sent successfully');
  });

  it('returns transport error message when send fails', async () => {
    const transport = { sendTextToThread: vi.fn().mockResolvedValue({ ok: false, error: 'missing_channel_node' }) } as unknown as ThreadTransportService;
    const tool = new SendMessageFunctionTool(transport);

    const output = await tool.execute({ message: 'hello' }, createCtx('thread-2'));

    expect(output).toBe('missing_channel_node');
  });

  it('returns missing_thread_context when context lacks thread id', async () => {
    const transport = { sendTextToThread: vi.fn() } as unknown as ThreadTransportService;
    const tool = new SendMessageFunctionTool(transport);

    const output = await tool.execute({ message: 'hello' }, createCtx());

    expect(output).toBe('missing_thread_context');
    expect(transport.sendTextToThread).not.toHaveBeenCalled();
  });
});
