import { describe, expect, it, vi } from 'vitest';
import type { NotificationEnvelope } from '@agyn/shared';
import type { Logger } from './logger.js';
import type { Server as SocketIOServer } from 'socket.io';
import { dispatchToRooms } from './dispatch.js';

const createLogger = (): Logger =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }) as unknown as Logger;

const createEnvelope = (): NotificationEnvelope => ({
  id: 'evt-1',
  ts: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  source: 'platform-server',
  rooms: ['graph', 'thread:abc123'],
  event: 'thread_updated',
  payload: { threadId: 'thread-1' },
});

describe('dispatchToRooms', () => {
  it('emits payload to every requested room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as SocketIOServer;
    const logger = createLogger();

    const envelope = createEnvelope();
    dispatchToRooms(io, envelope, logger);

    expect(to).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, envelope.event, envelope.payload);
    expect(emit).toHaveBeenNthCalledWith(2, envelope.event, envelope.payload);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs and continues when emit fails for a room', () => {
    const emit = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockImplementation(() => undefined);
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as SocketIOServer;
    const logger = createLogger();
    const envelope = createEnvelope();

    dispatchToRooms(io, envelope, logger);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'graph', event: envelope.event }),
      'emit failed',
    );
    expect(emit).toHaveBeenCalledTimes(envelope.rooms.length);
  });

  it('dispatches run status events to both thread and run rooms', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as SocketIOServer;
    const logger = createLogger();
    const envelope: NotificationEnvelope = {
      ...createEnvelope(),
      event: 'run_status_changed',
      rooms: ['thread:abc123', 'run:run-123'],
      payload: { threadId: 'abc123', runId: 'run-123', status: 'running' },
    };

    dispatchToRooms(io, envelope, logger);

    expect(to).toHaveBeenNthCalledWith(1, 'thread:abc123');
    expect(to).toHaveBeenNthCalledWith(2, 'run:run-123');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
