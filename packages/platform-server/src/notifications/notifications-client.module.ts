import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import {
  NotificationsGrpcPublisher,
  NOTIFICATIONS_GRPC_PUBLISHER_PROVIDER,
  NOTIFICATIONS_PUBLISHER_CONFIG,
  type NotificationsPublisherConfig,
} from './notifications-grpc.publisher';
import { UI_NOTIFICATIONS_PUBLISHER } from './ui-notifications.publisher';

const toBaseUrl = (addr: string): string => {
  const trimmed = addr.trim();
  if (!trimmed.includes('://')) {
    return `http://${trimmed}`;
  }
  return trimmed;
};

@Module({
  imports: [CoreModule],
  providers: [
    NotificationsGrpcPublisher,
    {
      provide: NOTIFICATIONS_PUBLISHER_CONFIG,
      useFactory: (config: ConfigService): NotificationsPublisherConfig => ({
        baseUrl: toBaseUrl(config.notificationsGrpcAddr),
        deadlineMs: config.notificationsGrpcDeadlineMs,
        source: 'platform-server',
      }),
      inject: [ConfigService],
    },
    NOTIFICATIONS_GRPC_PUBLISHER_PROVIDER,
  ],
  exports: [UI_NOTIFICATIONS_PUBLISHER],
})
export class NotificationsClientModule {}
