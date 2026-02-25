import { Module } from '@nestjs/common';
import { GraphApiModule } from '../graph/graph-api.module';
import { EventsModule } from '../events/events.module';
import { CoreModule } from '../core/core.module';
import { NotificationsPublisher } from './notifications.publisher';
import { NotificationsClient } from './notifications.client';

@Module({
  imports: [CoreModule, GraphApiModule, EventsModule],
  providers: [NotificationsPublisher, NotificationsClient],
})
export class NotificationsModule {}
