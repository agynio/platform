import { Module } from '@nestjs/common';
import { GraphApiModule } from '../graph/graph-api.module';
import { EventsModule } from '../events/events.module';
import { GraphSocketGateway } from './graph.socket.gateway';

@Module({
  imports: [GraphApiModule, EventsModule],
  providers: [GraphSocketGateway],
  exports: [GraphSocketGateway],
})
export class GatewayModule {}
