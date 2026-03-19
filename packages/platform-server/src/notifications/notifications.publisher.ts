import { create, type DescMessage, type JsonObject, type MessageInitShape, type MessageShape } from '@bufbuild/protobuf';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationsGrpcClient } from './notifications.grpc.client';
import { PublishRequestSchema } from '../proto/gen/agynio/api/notifications/v1/notifications_pb.js';

const NOTIFICATIONS_SOURCE = 'platform-server';

const createMessage = <Desc extends DescMessage>(
  schema: Desc,
  init?: MessageInitShape<Desc>,
): MessageShape<Desc> => create(schema, init) as MessageShape<Desc>;

@Injectable()
export class NotificationsPublisher {
  private readonly logger = new Logger(NotificationsPublisher.name);

  constructor(@Inject(NotificationsGrpcClient) private readonly client: NotificationsGrpcClient) {}

  async publish(event: string, rooms: string[], payload: unknown): Promise<void> {
    if (!this.client.isEnabled()) return;
    if (!event || rooms.length === 0) return;

    const jsonPayload = this.toJsonObject(event, rooms, payload);
    if (!jsonPayload) return;

    try {
      const request = createMessage(PublishRequestSchema, {
        event,
        rooms,
        payload: jsonPayload,
        source: NOTIFICATIONS_SOURCE,
      });
      await this.client.publish(request);
    } catch (error) {
      this.logger.warn(
        `Notifications publish failed${this.formatContext({
          event,
          rooms,
          error: this.toSafeError(error),
        })}`,
      );
    }
  }

  private toJsonObject(event: string, rooms: string[], payload: unknown): JsonObject | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      this.logger.warn(
        `Notifications payload invalid${this.formatContext({ event, rooms, payloadType: typeof payload })}`,
      );
      return null;
    }
    try {
      const parsed = JSON.parse(JSON.stringify(payload)) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.logger.warn(
          `Notifications payload invalid${this.formatContext({ event, rooms, payloadType: typeof parsed })}`,
        );
        return null;
      }
      return parsed as JsonObject;
    } catch (error) {
      this.logger.warn(
        `Notifications payload serialization failed${this.formatContext({
          event,
          rooms,
          error: this.toSafeError(error),
        })}`,
      );
      return null;
    }
  }

  private formatContext(context: Record<string, unknown>): string {
    return ` ${JSON.stringify(context)}`;
  }

  private toSafeError(error: unknown): { name?: string; message: string } {
    if (error instanceof Error) {
      return { name: error.name, message: error.message };
    }
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: String(error) };
    }
  }
}
