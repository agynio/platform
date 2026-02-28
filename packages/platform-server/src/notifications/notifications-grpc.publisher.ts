import { Inject, Injectable } from '@nestjs/common';
import { createClient, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { NotificationsService } from '../proto/gen/agynio/api/notifications/v1/notifications_pb.js';
import type { UiNotificationPublishRequest, UiNotificationsPublisher } from './ui-notifications.publisher';
import { UI_NOTIFICATIONS_PUBLISHER } from './ui-notifications.publisher';
import type { JsonObject, JsonValue } from '@bufbuild/protobuf';

export type NotificationsPublisherConfig = {
  baseUrl: string;
  deadlineMs: number;
  source: string;
};

export const NOTIFICATIONS_PUBLISHER_CONFIG = Symbol('NOTIFICATIONS_PUBLISHER_CONFIG');

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isJsonRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isJsonValue(entry)) {
      const descriptor = entry === null ? 'null' : Array.isArray(entry) ? 'array' : typeof entry;
      throw new Error(
        `NotificationsGrpcPublisher payload values must be JSON-serializable; field "${key}" is ${descriptor}`,
      );
    }
    result[key] = entry;
  }
  return result;
}

@Injectable()
export class NotificationsGrpcPublisher implements UiNotificationsPublisher {
  private readonly client: Client<typeof NotificationsService>;

  constructor(@Inject(NOTIFICATIONS_PUBLISHER_CONFIG) private readonly config: NotificationsPublisherConfig) {
    const transport = createConnectTransport({
      baseUrl: config.baseUrl,
      httpVersion: '2',
    });
    this.client = createClient(NotificationsService, transport);
  }

  async publishToRooms(request: UiNotificationPublishRequest): Promise<void> {
    const { rooms, event, payload, source } = request;
    if (!Array.isArray(rooms) || rooms.length === 0) {
      throw new Error('NotificationsGrpcPublisher requires at least one room');
    }

    let jsonPayload: JsonObject | undefined;
    if (payload !== undefined) {
      if (!isJsonRecord(payload)) {
        const descriptor = payload === null ? 'null' : Array.isArray(payload) ? 'array' : typeof payload;
        throw new Error(`NotificationsGrpcPublisher only supports object payloads; received ${descriptor}`);
      }
      jsonPayload = toJsonObject(payload);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.deadlineMs);
    try {
      await this.client.publish(
        {
          event,
          rooms,
          payload: jsonPayload,
          source: source ?? this.config.source,
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export const NOTIFICATIONS_GRPC_PUBLISHER_PROVIDER = {
  provide: UI_NOTIFICATIONS_PUBLISHER,
  useExisting: NotificationsGrpcPublisher,
};
