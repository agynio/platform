import { Module } from '@nestjs/common';
import { AgentsRemindersController } from '../agents/reminders.controller';
import { AgentsThreadsController } from '../agents/threads.controller';
import { ContextItemsController } from '../agents/contextItems.controller';
import { GraphController } from './controllers/graph.controller';
import { GraphPersistController } from './controllers/graphPersist.controller';
import { GraphVariablesController } from './controllers/graphVariables.controller';
import { MemoryController } from './controllers/memory.controller';
import { RunsController } from './controllers/runs.controller';
import { GraphGuard } from './graph.guard';
import { LiveGraphRuntime } from './liveGraph.manager';
import { NodeStateService } from './nodeState.service';
import { GraphVariablesService } from './services/graphVariables.service';
import { GraphDomainModule } from '../graph-domain/graph-domain.module';
import { RemindersController } from './controllers/reminders.controller';
import { EventsModule } from '../events/events.module';
import { GraphEventsBusListener } from './events/graph-events-bus.listener';

@Module({
  imports: [GraphDomainModule, EventsModule],
  controllers: [
    RunsController,
    GraphPersistController,
    GraphController,
    MemoryController,
    GraphVariablesController,
    AgentsThreadsController,
    ContextItemsController,
    AgentsRemindersController,
    RemindersController,
  ],
  providers: [
    GraphEventsBusListener,
    GraphGuard,
    LiveGraphRuntime,
    NodeStateService,
    GraphVariablesService,
  ],
  exports: [LiveGraphRuntime, NodeStateService, GraphVariablesService],
})
export class GraphApiModule {}
