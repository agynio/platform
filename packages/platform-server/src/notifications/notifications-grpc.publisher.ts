import { Inject, Injectable } from '@nestjs/common';
import { createClient } from '@connectrpc/connect';
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

type NotificationsPublishClient = {
  publish(
    request: {
      event: string;
      rooms: string[];
      payload?: Record<string, unknown> | undefined;
      source?: string;
    },
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
};

function isNotificationsPublishClient(value: unknown): value is NotificationsPublishClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { publish?: unknown }).publish === 'function'
  );
}

@Injectable()
export class NotificationsGrpcPublisher implements UiNotificationsPublisher {
  private readonly client: NotificationsPublishClient;

  constructor(@Inject(NOTIFICATIONS_PUBLISHER_CONFIG) private readonly config: NotificationsPublisherConfig) {
    /*
     * connect-es marks generated service definitions with @ts-nocheck, so createClient() currently
     * erases type information to `any`. We validate the publish method below before storing the client.
     */
    const candidate = createClient<typeof NotificationsService>(
      NotificationsService,
      createConnectTransport({
        baseUrl: config.baseUrl,
        httpVersion: '2',
      }),
    );
    if (!isNotificationsPublishClient(candidate)) {
      throw new Error('Notifications gRPC client missing publish implementation');
    }
    this.client = candidate;
  }

  async publishToRooms(request: UiNotificationPublishRequest): Promise<void> {
    const { rooms, event, payload, source } = request;
    if (!Array.isArray(rooms) || rooms.length === 0) return;

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
