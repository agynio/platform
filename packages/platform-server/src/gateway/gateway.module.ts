import { Module } from '@nestjs/common';
import { GraphApiModule } from '../graph/graph-api.module';
import { EventsModule } from '../events/events.module';
import { GraphSocketGateway } from './graph.socket.gateway';
import { NotificationsClientModule } from '../notifications/notifications-client.module';

@Module({
  imports: [GraphApiModule, EventsModule, NotificationsClientModule],
  providers: [GraphSocketGateway],
  exports: [GraphSocketGateway],
})
export class GatewayModule {}
