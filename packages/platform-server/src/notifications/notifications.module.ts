import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { NotificationsGrpcClient } from './notifications.grpc.client';
import { NotificationsPublisher } from './notifications.publisher';

@Module({
  imports: [CoreModule],
  providers: [NotificationsGrpcClient, NotificationsPublisher],
  exports: [NotificationsPublisher],
})
export class NotificationsModule {}
