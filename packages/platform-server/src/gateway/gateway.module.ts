import { Module } from '@nestjs/common';
import { GraphApiModule } from '../graph/graph-api.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GraphSocketGateway } from './graph.socket.gateway';

@Module({
  imports: [GraphApiModule, EventsModule, NotificationsModule],
  providers: [GraphSocketGateway],
  exports: [GraphSocketGateway],
})
export class GatewayModule {}
