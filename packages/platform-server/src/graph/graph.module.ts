import { Module, forwardRef } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { AgentsRemindersController } from '../agents/reminders.controller';
import { AgentsThreadsController } from '../agents/threads.controller';
import { ContextItemsController } from '../agents/contextItems.controller';
import { EnvModule } from '../env/env.module';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';
import { GraphEventsPublisher } from '../gateway/graph.events.publisher';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { GraphController } from './controllers/graph.controller';
import { GraphPersistController } from './controllers/graphPersist.controller';
import { GraphVariablesController } from './controllers/graphVariables.controller';
import { MemoryController } from './controllers/memory.controller';
import { RunsController } from './controllers/runs.controller';
import { GraphGuard } from './graph.guard';
import { LiveGraphRuntime } from './liveGraph.manager';
import { NodeStateService } from './nodeState.service';
import { GraphVariablesService } from './services/graphVariables.service';
import { NodesModule } from '../nodes/nodes.module';
import { GraphServicesModule } from './graph-services.module';
import { EventsModule } from '../events/events.module';
import { RemindersController } from './controllers/reminders.controller';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [CoreModule, InfraModule, EnvModule, forwardRef(() => NodesModule), forwardRef(() => GraphServicesModule), forwardRef(() => LLMModule), forwardRef(() => EventsModule)],
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
    {
      provide: GraphGuard,
      useClass: GraphGuard,
    },
    LiveGraphRuntime,
    NodeStateService,
    // Gateway and publisher binding
    GraphSocketGateway,
    {
      provide: GraphEventsPublisher,
      useExisting: GraphSocketGateway,
    },
    {
      provide: 'GRAPH_EVENTS_PUBLISHER_BINDING',
      useFactory: (persistence: AgentsPersistenceService, publisher: GraphEventsPublisher) => {
        persistence.setEventsPublisher(publisher);
        return true;
      },
      inject: [AgentsPersistenceService, GraphEventsPublisher],
    },
    // PrismaService is injected by type; no string token aliasing required
    // Standard DI for GraphVariablesService
    GraphVariablesService,
  ],
  exports: [
    GraphServicesModule,
    LiveGraphRuntime,
    NodeStateService,
    GraphEventsPublisher,
    GraphSocketGateway,
  ],
})
export class GraphModule {}
