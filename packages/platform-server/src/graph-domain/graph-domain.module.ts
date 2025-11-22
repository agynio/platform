import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { EventsModule } from '../events/events.module';
import { GraphEventsBusListener } from './listeners/graph-events-bus.listener';

@Module({
  imports: [CoreModule, EventsModule],
  providers: [GraphEventsBusListener],
  exports: [EventsModule],
})
export class GraphDomainModule {}
