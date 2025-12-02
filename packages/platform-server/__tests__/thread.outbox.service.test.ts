import { describe, expect, it, vi } from 'vitest';
import { ThreadOutboxService } from '../src/messaging/threadOutbox.service';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { ChannelRouter } from '../src/messaging/channelRouter.service';
import type { IChannelAdapter } from '../src/messaging/types';

describe('ThreadOutboxService', () => {
  const makePersistence = () => ({
    recordOutboxMessage: vi.fn(async () => ({ messageId: 'msg-1' })),
  }) as unknown as AgentsPersistenceService & { recordOutboxMessage: ReturnType<typeof vi.fn> };

  const makeRouter = (adapter: IChannelAdapter | null) => ({
    getAdapter: vi.fn(async () => adapter),
  }) as unknown as ChannelRouter & { getAdapter: ReturnType<typeof vi.fn> };

  it('persists message and forwards via resolved adapter', async () => {
    const persistence = makePersistence();
    const adapter: IChannelAdapter & { sendText: ReturnType<typeof vi.fn> } = {
      sendText: vi.fn(async () => ({ ok: true, channelMessageId: 'c42', threadId: 'thread-1' })),
    } as any;
    const router = makeRouter(adapter);
    const service = new ThreadOutboxService(persistence, router);

    const result = await service.send({ threadId: 'thread-1', text: 'hello', source: 'send_message', runId: 'run-1' });

    expect(result).toEqual({ ok: true, channelMessageId: 'c42', threadId: 'thread-1' });
    expect(persistence.recordOutboxMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      text: 'hello',
      role: 'assistant',
      source: 'send_message',
      runId: 'run-1',
    });
    expect(adapter.sendText).toHaveBeenCalledWith({
      threadId: 'thread-1',
      text: 'hello',
      source: 'send_message',
      prefix: undefined,
      runId: 'run-1',
    });
  });

  it('returns error when adapter missing', async () => {
    const persistence = makePersistence();
    const router = makeRouter(null);
    const service = new ThreadOutboxService(persistence, router);
    const result = await service.send({ threadId: 'thread-2', text: 'hello', source: 'send_message', runId: 'run-2' });
    expect(result).toEqual({ ok: false, error: 'missing_channel_adapter' });
    expect(persistence.recordOutboxMessage).toHaveBeenCalledTimes(1);
    expect(router.getAdapter).toHaveBeenCalledWith('thread-2');
  });

  it('bubbles persistence errors', async () => {
    const persistence = ({
      recordOutboxMessage: vi.fn(async () => {
        throw new Error('db-fail');
      }),
    } as unknown) as AgentsPersistenceService & { recordOutboxMessage: ReturnType<typeof vi.fn> };
    const router = makeRouter({
      sendText: vi.fn(async () => ({ ok: true })),
    } as any);
    const service = new ThreadOutboxService(persistence, router);
    const result = await service.send({ threadId: 'thread-3', text: 'hi', source: 'send_message', runId: 'run-3' });
    expect(result).toEqual({ ok: false, error: 'db-fail' });
    expect(router.getAdapter).not.toHaveBeenCalled();
  });
});
