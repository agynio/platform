import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { create } from '@bufbuild/protobuf';
import type { HandlerContext } from '@connectrpc/connect';
import { GrpcServer } from '../src/grpc';
import type { NotificationFanout } from '../src/redis-notifications';
import type { PublishedNotification } from '../src/types';
import {
  PublishRequestSchema,
  SubscribeRequestSchema,
} from '../src/proto/gen/agynio/api/notifications/v1/notifications_pb.js';

class StubFanout implements NotificationFanout {
  readonly published: PublishedNotification[] = [];
  private readonly listeners = new Set<(notification: PublishedNotification) => void>();

  async publish(notification: PublishedNotification): Promise<void> {
    this.published.push(notification);
    for (const listener of this.listeners) {
      listener(notification);
    }
  }

  subscribe(listener: (notification: PublishedNotification) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(notification: PublishedNotification): void {
    for (const listener of this.listeners) {
      listener(notification);
    }
  }
}

const makeServer = (fanout: StubFanout) =>
  new GrpcServer({
    host: '127.0.0.1',
    port: 0,
    notifications: fanout,
    logger: pino({ level: 'silent' }),
  });

const makeContext = (): HandlerContext => ({
  signal: new AbortController().signal,
  values: new Map(),
  requestHeader: new Headers(),
});

describe('GrpcServer publish', () => {
  it('rejects invalid publish requests', async () => {
    const fanout = new StubFanout();
    const server = makeServer(fanout);
    const request = create(PublishRequestSchema, {
      event: 'agent.updated',
      rooms: [],
      source: 'platform-server',
    });

    await expect(server.publish(request, makeContext())).rejects.toThrowError('invalid publish request');
    await server.close();
  });

  it('publishes notifications with generated identifiers', async () => {
    const fanout = new StubFanout();
    const server = makeServer(fanout);
    const request = create(PublishRequestSchema, {
      event: 'agent.updated',
      rooms: ['graph'],
      source: 'platform-server',
      payload: { status: 'ready' },
    });

    const response = await server.publish(request, makeContext());

    expect(response.id).toMatch(/[0-9a-f-]{36}/i);
    expect(fanout.published).toHaveLength(1);
    expect(fanout.published[0]).toMatchObject({
      event: 'agent.updated',
      rooms: ['graph'],
      source: 'platform-server',
      payload: { status: 'ready' },
    });
    expect(fanout.published[0]?.id).toBe(response.id);

    await server.close();
  });
});

describe('GrpcServer subscribe', () => {
  it('streams redis-delivered notifications to subscribers', async () => {
    const fanout = new StubFanout();
    const server = makeServer(fanout);
    const abortController = new AbortController();
    const context = { signal: abortController.signal };
    const request = create(SubscribeRequestSchema, {});

    const iterable = server.subscribe(request, context);
    const iterator = iterable[Symbol.asyncIterator]();

    const pending = iterator.next();
    const notification: PublishedNotification = {
      id: randomUUID(),
      event: 'agent.updated',
      rooms: ['graph'],
      source: 'platform-server',
      payload: { status: 'ready' },
      createdAt: new Date('2025-01-02T03:04:05Z'),
    };
    fanout.emit(notification);

    const result = await pending;
    expect(result.done).toBe(false);
    expect(result.value?.envelope?.event).toBe('agent.updated');
    expect(result.value?.envelope?.rooms).toEqual(['graph']);
    expect(result.value?.envelope?.source).toBe('platform-server');

    abortController.abort();
    const final = await iterator.next();
    expect(final.done).toBe(true);

    await server.close();
  });
});
