import { Module } from '@nestjs/common';
import { GraphApiModule } from '../graph/graph-api.module';
import { EventsModule } from '../events/events.module';
import { NotificationsPublisher } from './notifications.publisher';
import { NotificationsBroker } from './notifications.broker';

@Module({
  imports: [GraphApiModule, EventsModule],
  providers: [NotificationsPublisher, NotificationsBroker],
})
export class NotificationsModule {}
