import { Module, forwardRef } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { GraphModule } from '../graph/graph.module';
import { RunEventsService } from './run-events.service';

@Module({
  imports: [CoreModule, forwardRef(() => GraphModule)],
  providers: [RunEventsService],
  exports: [RunEventsService],
})
export class EventsModule {}
