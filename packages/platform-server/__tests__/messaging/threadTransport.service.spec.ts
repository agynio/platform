import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ThreadTransportService } from '../../src/messaging/threadTransport.service';
import type { PrismaService } from '../../src/core/services/prisma.service';
import type { LiveGraphRuntime } from '../../src/graph-core/liveGraph.manager';
import type { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';

describe('ThreadTransportService', () => {
  const threadFindUnique = vi.fn();
  const prismaClient = { thread: { findUnique: threadFindUnique } };
  const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
  const getNodeInstance = vi.fn();
  const runtime = { getNodeInstance } as unknown as LiveGraphRuntime;
  const recordTransportAssistantMessage = vi.fn();
  const persistence = {
    recordTransportAssistantMessage,
  } as unknown as AgentsPersistenceService;
  let service: ThreadTransportService;

  beforeEach(() => {
    threadFindUnique.mockReset();
    getNodeInstance.mockReset();
    recordTransportAssistantMessage.mockReset();
    recordTransportAssistantMessage.mockResolvedValue({ messageId: 'msg-1' });
    service = new ThreadTransportService(prismaService, runtime, persistence);
  });

  it('routes message to channel node when available', async () => {
    threadFindUnique.mockResolvedValue({ channelNodeId: 'node-123' });
    const sendToChannel = vi.fn().mockResolvedValue({ ok: true, threadId: 'thread-1' });
    getNodeInstance.mockReturnValue({ sendToChannel });

    const result = await service.sendTextToThread('thread-1', 'hello world', {
      runId: 'run-1',
      source: 'auto_response',
    });

    expect(sendToChannel).toHaveBeenCalledWith('thread-1', 'hello world');
    expect(result.ok).toBe(true);
    expect(result.threadId).toBe('thread-1');
    expect(recordTransportAssistantMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      text: 'hello world',
      runId: 'run-1',
      source: 'auto_response',
    });
  });

  it('returns error when channel node does not implement transport interface', async () => {
    threadFindUnique.mockResolvedValue({ channelNodeId: 'node-unsupported' });
    getNodeInstance.mockReturnValue({});

    const result = await service.sendTextToThread('thread-2', 'message');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('unsupported_channel_node');
    expect(recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('bubbles up transport error without persisting', async () => {
    threadFindUnique.mockResolvedValue({ channelNodeId: 'node-123' });
    const sendToChannel = vi.fn().mockResolvedValue({ ok: false, error: 'missing_channel' });
    getNodeInstance.mockReturnValue({ sendToChannel });

    const result = await service.sendTextToThread('thread-3', 'hello');

    expect(result).toEqual({ ok: false, error: 'missing_channel' });
    expect(recordTransportAssistantMessage).not.toHaveBeenCalled();
  });

  it('returns persist_failed when persistence throws', async () => {
    threadFindUnique.mockResolvedValue({ channelNodeId: 'node-123' });
    const sendToChannel = vi.fn().mockResolvedValue({ ok: true, threadId: 'thread-4' });
    getNodeInstance.mockReturnValue({ sendToChannel });
    recordTransportAssistantMessage.mockRejectedValue(new Error('db down'));

    const result = await service.sendTextToThread('thread-4', 'hi');

    expect(result).toEqual({ ok: false, error: 'persist_failed', threadId: 'thread-4' });
    expect(recordTransportAssistantMessage).toHaveBeenCalledWith({
      threadId: 'thread-4',
      text: 'hi',
      runId: null,
      source: null,
    });
  });
});
