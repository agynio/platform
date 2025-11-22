import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { RunEventsService } from './run-events.service';
import { EventsBusService } from './events-bus.service';

@Module({
  imports: [CoreModule],
  providers: [RunEventsService, EventsBusService],
  exports: [RunEventsService, EventsBusService],
})
export class EventsModule {}
