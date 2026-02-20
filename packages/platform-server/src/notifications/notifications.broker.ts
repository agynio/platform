import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { NotificationEnvelope } from '@agyn/shared';
import { ConfigService } from '../core/services/config.service';

@Injectable()
export class NotificationsBroker {
  private readonly redis: Redis;
  private readonly channel: string;
  private connected = false;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    ConfigService.assertInitialized(config);
    this.channel = config.notificationsChannel;
    this.redis = new Redis(config.notificationsRedisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.redis.connect();
    this.connected = true;
  }

  async publish(envelope: NotificationEnvelope): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    await this.redis.publish(this.channel, JSON.stringify(envelope));
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    await this.redis.quit();
  }
}
