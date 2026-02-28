import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { create, type JsonObject } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ConnectError, Code, type HandlerContext } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { createServer, type Http2Server } from 'node:http2';
import { NotificationBroadcaster } from './broadcaster';
import type { SocketBridge } from './socket';
import { PublishInputSchema } from './validation';
import type { JsonValue, PublishedNotification } from './types';
import { NotificationsService } from './proto/gen/agynio/api/notifications/v1/notifications_connect.js';
import {
  NotificationEnvelopeSchema,
  PublishResponseSchema,
  SubscribeResponseSchema,
  type PublishRequest,
  type PublishResponse,
  type SubscribeRequest,
  type SubscribeResponse,
  type NotificationEnvelope,
} from './proto/gen/agynio/api/notifications/v1/notifications_pb.js';

type GrpcServerOptions = {
  host: string;
  port: number;
  broadcaster: NotificationBroadcaster;
  socket: SocketBridge;
  logger: Logger;
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isJsonObject(value)) {
    for (const entry of Object.values(value)) {
      if (!isJsonValue(entry)) return false;
    }
    return true;
  }
  return false;
};

const toJsonObject = (value: Record<string, unknown>): JsonObject => {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isJsonValue(entry)) {
      throw new ConnectError('publish payload includes non-JSON value', Code.InvalidArgument);
    }
    result[key] = entry;
  }
  return result;
};

const toEnvelope = (notification: PublishedNotification): NotificationEnvelope =>
  create(NotificationEnvelopeSchema, {
    id: notification.id,
    ts: timestampFromDate(notification.createdAt),
    source: notification.source,
    event: notification.event,
    rooms: notification.rooms,
    payload: notification.payload,
  });

export class GrpcServer {
  private readonly logger: Logger;
  private readonly server: Http2Server;

  constructor(private readonly options: GrpcServerOptions) {
    this.logger = options.logger.child({ scope: 'grpc' });
    const publishImpl = async (request: PublishRequest): Promise<PublishResponse> => {
      const parsed = PublishInputSchema.safeParse({
        event: request.event,
        rooms: request.rooms,
        source: request.source,
        payload: request.payload,
      });
      if (!parsed.success) {
        this.logger.warn({ issues: parsed.error.issues }, 'publish request rejected');
        throw new ConnectError('invalid publish request', Code.InvalidArgument);
      }

      const payload = parsed.data;
      const notificationPayload = payload.payload ? toJsonObject(payload.payload) : undefined;
      const notification: PublishedNotification = {
        id: randomUUID(),
        event: payload.event,
        rooms: payload.rooms,
        source: payload.source,
        payload: notificationPayload,
        createdAt: new Date(),
      };

      this.logger.debug({ event: notification.event, rooms: notification.rooms }, 'publish request accepted');
      this.options.socket.broadcast(notification);
      this.options.broadcaster.publish(notification);

      return create(PublishResponseSchema, {
        id: notification.id,
        ts: timestampFromDate(notification.createdAt),
      });
    };

    const subscribeImpl = (
      _request: SubscribeRequest,
      context: HandlerContext,
    ): AsyncIterable<SubscribeResponse> => {
      const queue: PublishedNotification[] = [];
      let resolveQueue: ((value: PublishedNotification | null) => void) | null = null;
      let finished = false;

      const push = (notification: PublishedNotification) => {
        if (finished) return;
        if (resolveQueue) {
          const resolve = resolveQueue;
          resolveQueue = null;
          resolve(notification);
        } else {
          queue.push(notification);
        }
      };

      const stop = () => {
        if (finished) return;
        finished = true;
        if (resolveQueue) {
          const resolve = resolveQueue;
          resolveQueue = null;
          resolve(null);
        }
      };

      const unsubscribe = this.options.broadcaster.subscribe(push);
      const abortHandler = (): void => {
        stop();
      };
      context.signal.addEventListener('abort', abortHandler, { once: true });

      const iterator = (async function* (this: GrpcServer) {
        try {
          while (true) {
            if (queue.length > 0) {
              const notification = queue.shift()!;
              yield create(SubscribeResponseSchema, { envelope: toEnvelope(notification) });
              continue;
            }
            if (finished) break;
            const notification = await new Promise<PublishedNotification | null>((resolve) => {
              resolveQueue = resolve;
            });
            if (!notification) break;
            yield create(SubscribeResponseSchema, { envelope: toEnvelope(notification) });
          }
        } finally {
          context.signal.removeEventListener('abort', abortHandler);
          unsubscribe();
          stop();
        }
      }.call(this)) as AsyncIterable<SubscribeResponse>;

      return iterator;
    };

    const handler = connectNodeAdapter({
      routes: (router) => {
        router.service(NotificationsService as unknown as never, {
          publish: publishImpl as unknown as never,
          subscribe: subscribeImpl as unknown as never,
        });
      },
    });

    const server = createServer();
    server.on('stream', handler);
    server.on('request', handler);
    this.server = server;
  }

  async start(): Promise<void> {
    const { host, port } = this.options;
    await new Promise<void>((resolve) => {
      this.server.listen(port, host, () => resolve());
    });
    this.logger.info({ host, port }, 'grpc server listening');
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error: Error | undefined) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
