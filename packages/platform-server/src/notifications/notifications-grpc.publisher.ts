import { Inject, Injectable } from '@nestjs/common';
import { createClient, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { NotificationsService } from '../proto/gen/agynio/api/notifications/v1/notifications_pb.js';
import type { UiNotificationPublishRequest, UiNotificationsPublisher } from './ui-notifications.publisher';
import { UI_NOTIFICATIONS_PUBLISHER } from './ui-notifications.publisher';

export type NotificationsPublisherConfig = {
  baseUrl: string;
  deadlineMs: number;
  source: string;
};

export const NOTIFICATIONS_PUBLISHER_CONFIG = Symbol('NOTIFICATIONS_PUBLISHER_CONFIG');

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

    let jsonPayload: Record<string, unknown> | undefined;
    if (payload !== undefined) {
      if (!isJsonRecord(payload)) {
        const descriptor = payload === null ? 'null' : Array.isArray(payload) ? 'array' : typeof payload;
        throw new Error(`NotificationsGrpcPublisher only supports object payloads; received ${descriptor}`);
      }
      jsonPayload = payload;
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
