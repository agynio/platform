import { forwardRef, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { MongoService } from '../core/services/mongo.service';
import { EnvModule } from '../env/env.module';
import { EventsModule } from '../events/events.module';
import { InfraModule } from '../infra/infra.module';
import { ContainerService } from '../infra/container/container.service';
import { NcpsKeyService } from '../infra/ncps/ncpsKey.service';
import { LLMModule } from '../llm/llm.module';
import { NodesModule } from '../nodes/nodes.module';
import { buildTemplateRegistry } from '../templates';
import { VaultModule } from '../vault/vault.module';
import { GitGraphRepository } from './gitGraph.repository';
import { GraphRepository } from './graph.repository';
import { MongoGraphRepository } from './graphMongo.repository';
import { PortsRegistry } from './ports.registry';
import { TemplateRegistry } from './templateRegistry';
import { CallAgentLinkingService } from '../agents/call-agent-linking.service';

@Module({
  imports: [
    CoreModule,
    InfraModule,
    EventsModule,
    LLMModule,
    EnvModule,
    VaultModule,
    forwardRef(() => NodesModule),
  ],
  providers: [
    ThreadsMetricsService,
    {
      provide: TemplateRegistry,
      useFactory: (
        logger: LoggerService,
        containerService: ContainerService,
        configService: ConfigService,
        mongoService: MongoService,
        ncpsKeyService: NcpsKeyService,
        moduleRef: ModuleRef,
      ) =>
        buildTemplateRegistry({
          logger,
          containerService,
          configService,
          mongoService,
          ncpsKeyService,
          moduleRef,
        }),
      inject: [LoggerService, ContainerService, ConfigService, MongoService, NcpsKeyService, ModuleRef],
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
          const svc = new MongoGraphRepository(mongo.getDb(), logger, templateRegistry, config);
          await svc.initIfNeeded();
          return svc;
        }
      },
      inject: [ConfigService, LoggerService, MongoService, TemplateRegistry],
    },
    AgentsPersistenceService,
    CallAgentLinkingService,
  ],
  exports: [ThreadsMetricsService, TemplateRegistry, PortsRegistry, GraphRepository, AgentsPersistenceService, CallAgentLinkingService],
})
export class GraphServicesModule {}
