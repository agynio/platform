import { Module } from '@nestjs/common';
import { AgentsRemindersController } from '../agents/reminders.controller';
import { AgentsThreadsController } from '../agents/threads.controller';
import { ContextItemsController } from '../agents/contextItems.controller';
import { GraphController } from './controllers/graph.controller';
import { MemoryController } from './controllers/memory.controller';
import { RunsController } from './controllers/runs.controller';
import { GraphDomainModule } from '../graph-domain/graph-domain.module';
import { RemindersController } from './controllers/reminders.controller';
import { EventsModule } from '../events/events.module';
import { GraphCoreModule } from '../graph-core/graph-core.module';
import { VariablesController } from './controllers/variables.controller';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [GraphCoreModule, GraphDomainModule, EventsModule, TeamsModule],
  controllers: [
    RunsController,
    GraphController,
    MemoryController,
    AgentsThreadsController,
    ContextItemsController,
    AgentsRemindersController,
    RemindersController,
    VariablesController,
  ],
  providers: [],
  exports: [GraphCoreModule],
})
export class GraphApiModule {}
