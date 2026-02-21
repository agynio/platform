import { Module } from '@nestjs/common';
import { GraphApiModule } from '../graph/graph-api.module';
import { EventsModule } from '../events/events.module';
import { CoreModule } from '../core/core.module';
import { NotificationsPublisher } from './notifications.publisher';
import { NotificationsBroker } from './notifications.broker';

@Module({
  imports: [CoreModule, GraphApiModule, EventsModule],
  providers: [NotificationsPublisher, NotificationsBroker],
})
export class NotificationsModule {}
