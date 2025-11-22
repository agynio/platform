import { Module } from '@nestjs/common';
import { GraphApiModule } from '../graph/graph-api.module';
import { GraphSocketGateway } from './graph.socket.gateway';
import { GraphEventsPublisher } from '../graph/events/graph.events.publisher';
import { GraphEventsPersistenceBridge } from './graph-events.persistence.bridge';

@Module({
  imports: [GraphApiModule],
  providers: [
    GraphSocketGateway,
    { provide: GraphEventsPublisher, useExisting: GraphSocketGateway },
    GraphEventsPersistenceBridge,
  ],
  exports: [GraphSocketGateway, GraphEventsPublisher],
})
export class GatewayModule {}
