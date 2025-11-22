import { Global, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ModuleRef } from '@nestjs/core';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { EventsModule } from '../events/events.module';
import { InfraModule } from '../infra/infra.module';
import { ContainerService } from '../infra/container/container.service';
import { NcpsKeyService } from '../infra/ncps/ncpsKey.service';
import { EnvModule } from '../env/env.module';
import { LLMModule } from '../llm/llm.module';
import { LLMProvisioner } from '../llm/provisioners/llm.provisioner';
import { VaultModule } from '../vault/vault.module';
import { NodesModule } from '../nodes/nodes.module';
import { TemplateRegistry } from '../graph/templateRegistry';
import { buildTemplateRegistry } from '../templates';
import { GraphRepository } from '../graph/graph.repository';
import { GitGraphRepository } from '../graph/gitGraph.repository';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { RunSignalsRegistry } from '../agents/run-signals.service';
import { CallAgentLinkingService } from '../agents/call-agent-linking.service';

@Global()
@Module({
  imports: [CoreModule, EnvModule, EventsModule, InfraModule, VaultModule, LLMModule, NodesModule],
  providers: [
    ThreadsMetricsService,
    RunSignalsRegistry,
    CallAgentLinkingService,
    {
      provide: TemplateRegistry,
      useFactory: (
        logger: LoggerService,
        containerService: ContainerService,
        configService: ConfigService,
        ncpsKeyService: NcpsKeyService,
        provisioner: LLMProvisioner,
        moduleRef: ModuleRef,
      ) =>
        buildTemplateRegistry({
          logger,
          containerService,
          configService,
          ncpsKeyService,
          provisioner,
          moduleRef,
        }),
      inject: [LoggerService, ContainerService, ConfigService, NcpsKeyService, LLMProvisioner, ModuleRef],
    },
    {
      provide: GraphRepository,
      useFactory: async (
        config: ConfigService,
        logger: LoggerService,
        templateRegistry: TemplateRegistry,
      ) => {
        const repo = new GitGraphRepository(config, logger, templateRegistry);
        await repo.initIfNeeded();
        return repo;
      },
      inject: [ConfigService, LoggerService, TemplateRegistry],
    },
    AgentsPersistenceService,
  ],
  exports: [
    CoreModule,
    EnvModule,
    InfraModule,
    VaultModule,
    LLMModule,
    NodesModule,
    TemplateRegistry,
    GraphRepository,
    AgentsPersistenceService,
    ThreadsMetricsService,
    RunSignalsRegistry,
    CallAgentLinkingService,
  ],
})
export class GraphDomainModule {}
