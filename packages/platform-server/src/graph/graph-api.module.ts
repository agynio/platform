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
import { NodeStateService } from './nodeState.service';
import { GraphVariablesService } from './services/graphVariables.service';
import { GraphDomainModule } from '../graph-domain/graph-domain.module';
import { RemindersController } from './controllers/reminders.controller';
import { EventsModule } from '../events/events.module';
import { GraphCoreModule } from '../graph-core/graph-core.module';

@Module({
  imports: [GraphCoreModule, GraphDomainModule, EventsModule],
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
  providers: [GraphGuard, NodeStateService, GraphVariablesService],
  exports: [GraphCoreModule, NodeStateService, GraphVariablesService],
})
export class GraphApiModule {}
