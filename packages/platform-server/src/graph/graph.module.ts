import { Module } from '@nestjs/common';
import { TemplateRegistry } from './templateRegistry';
import { PortsRegistry } from './ports.registry';
import { GraphRepository } from './graph.repository';
import { MongoGraphRepository } from './graphMongo.repository';
import { GitGraphRepository } from './gitGraph.repository';
import { LiveGraphRuntime } from './liveGraph.manager';
import { RunsController } from './controllers/runs.controller';
import { GraphPersistController } from './controllers/graphPersist.controller';
import { GraphController } from './controllers/graph.controller';
import { NodesModule } from '../nodes/nodes.module';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { AgentRunService } from '../nodes/agentRun.repository';
import { buildTemplateRegistry } from '../templates';
import { LoggerService } from '../core/services/logger.service';
import { ContainerService } from '../infra/container/container.service';
import { ConfigService } from '../core/services/config.service';
import { MongoService } from '../core/services/mongo.service';
import { LLMFactoryService } from '../llm/llmFactory.service';
import { NcpsKeyService } from '../core/services/ncpsKey.service';
import { Provider } from '@nestjs/common';

@Module({
  imports: [CoreModule, InfraModule, NodesModule],
  controllers: [RunsController, GraphPersistController, GraphController],
  providers: [
    {
      provide: TemplateRegistry,
      useFactory: (
        logger: LoggerService,
        containerService: ContainerService,
        configService: ConfigService,
        mongoService: MongoService,
        llmFactoryService: LLMFactoryService,
        ncpsKeyService: NcpsKeyService,
      ) =>
        buildTemplateRegistry({
          logger,
          containerService,
          configService,
          mongoService,
          llmFactoryService,
          ncpsKeyService,
        }),
      inject: [LoggerService, ContainerService, ConfigService, MongoService, LLMFactoryService, NcpsKeyService],
    },
    PortsRegistry,
    {
      provide: GraphRepository,
      useFactory: async (
        config: ConfigService,
        logger: LoggerService,
        mongo: MongoService,
        templateRegistry: TemplateRegistry,
      ) => {
        if (config.graphStore === 'git') {
          const svc = new GitGraphRepository(config, logger, templateRegistry);
          await svc.initIfNeeded();
          return svc;
        } else {
          const svc = new MongoGraphRepository(mongo.getDb(), logger, templateRegistry);
          await svc.initIfNeeded();
          return svc;
        }
      },
      inject: [ConfigService, LoggerService, MongoService, TemplateRegistry],
    },
    LiveGraphRuntime,
    AgentRunService,
    // Guards (functions are not providers; list here for visibility if later wrapped)
    // enforceMcpCommandMutationGuard is a pure function and intentionally not registered
  ],
  exports: [LiveGraphRuntime, TemplateRegistry, PortsRegistry, GraphRepository, AgentRunService],
})
export class GraphModule {}
