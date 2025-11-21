import { Module, forwardRef } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { GraphModule } from '../graph/graph.module';
import { RunEventsService } from './run-events.service';
import { EventsBusService } from './events-bus.service';

@Module({
  imports: [CoreModule, forwardRef(() => GraphModule)],
  providers: [RunEventsService, EventsBusService],
  exports: [RunEventsService, EventsBusService],
})
export class EventsModule {}
