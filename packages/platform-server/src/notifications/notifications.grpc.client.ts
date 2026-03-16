import { createClient, type Client } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../core/services/config.service';
import { NotificationsService } from '../proto/gen/agynio/api/notifications/v1/notifications_pb.js';
import type {
  PublishRequest,
  PublishResponse,
} from '../proto/gen/agynio/api/notifications/v1/notifications_pb.js';

@Injectable()
export class NotificationsGrpcClient {
  private readonly client?: Client<typeof NotificationsService>;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const addr = this.config.notificationsGrpcAddr;
    if (!addr) return;
    const baseUrl = NotificationsGrpcClient.normalizeBaseUrl(addr);
    const transport = createGrpcTransport({ baseUrl });
    this.client = createClient(NotificationsService, transport);
  }

  isEnabled(): boolean {
    return Boolean(this.client);
  }

  async publish(request: PublishRequest): Promise<PublishResponse> {
    if (!this.client) {
      throw new Error('Notifications gRPC client not configured');
    }
    return this.client.publish(request);
  }

  private static normalizeBaseUrl(addr: string): string {
    const trimmed = addr.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed.replace(/\/+$/, '');
    }
    return `http://${trimmed.replace(/\/+$/, '')}`;
  }
}
