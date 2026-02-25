import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationRoom } from '@agyn/shared';
import { fetch as nodeFetch } from 'node-fetch-native';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '../core/services/config.service';

type PublishOptions = {
  traceId?: string;
  source?: string;
};

type PublishPayload = {
  event: string;
  rooms: NotificationRoom[];
  payload: unknown;
  source?: string;
  traceId?: string;
};

@Injectable()
export class NotificationsClient {
  private readonly logger = new Logger(NotificationsClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs = 2000;
  private readonly retryDelaysMs = [100, 300] as const;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    ConfigService.assertInitialized(config);
    this.baseUrl = config.notificationsHttpUrl;
  }

  async publish(event: string, rooms: NotificationRoom[], payload: unknown, options?: PublishOptions): Promise<void> {
    if (!rooms.length) return;

    const body: PublishPayload = {
      event,
      rooms,
      payload,
      source: options?.source ?? 'platform-server',
    };
    if (options?.traceId) {
      body.traceId = options.traceId;
    }

    const endpoint = `${this.baseUrl}/internal/notifications/publish`;
    const maxAttempts = this.retryDelaysMs.length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.postNotification(endpoint, body);
        return;
      } catch (error) {
        const attemptNumber = attempt + 1;
        const context: Record<string, unknown> = {
          event,
          rooms,
          attempt: attemptNumber,
          error: this.toSafeError(error),
        };
        if (options?.traceId) {
          context.traceId = options.traceId;
        }
        if (attempt < this.retryDelaysMs.length) {
          const delays = this.retryDelaysMs;
          const delay = delays[attempt] ?? delays[delays.length - 1];
          context.retryInMs = delay;
          this.logger.warn(`NotificationsClient publish attempt failed${this.formatContext(context)}`);
          await sleep(delay);
          continue;
        }
        this.logger.error(`NotificationsClient publish failed${this.formatContext(context)}`);
        return;
      }
    }
  }

  private async postNotification(endpoint: string, body: PublishPayload): Promise<void> {
    const controller = new AbortController();
    const abortTimeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await nodeFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => undefined);
        throw new Error(`HTTP ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
      }
    } finally {
      clearTimeout(abortTimeout);
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
