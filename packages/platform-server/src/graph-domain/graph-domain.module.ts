import { Global, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { EventsModule } from '../events/events.module';
import { InfraModule } from '../infra/infra.module';
import { EnvModule } from '../env/env.module';
import { LLMModule } from '../llm/llm.module';
import { VaultModule } from '../vault/vault.module';
import { GraphRepository } from '../graph/graph.repository';
import { GitGraphRepository } from '../graph/gitGraph.repository';
import { NodesModule } from '../nodes/nodes.module';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { RunSignalsRegistry } from '../agents/run-signals.service';
import { CallAgentLinkingService } from '../agents/call-agent-linking.service';
import { TemplateRegistry } from '../graph-core/templateRegistry';

@Global()
@Module({
  imports: [CoreModule, EnvModule, EventsModule, InfraModule, VaultModule, LLMModule, NodesModule],
  providers: [
    ThreadsMetricsService,
    RunSignalsRegistry,
    CallAgentLinkingService,
    {
      provide: GraphRepository,
      useFactory: async (config: ConfigService, logger: LoggerService, moduleRef: ModuleRef) => {
        const templateRegistry = await moduleRef.resolve(TemplateRegistry, undefined, { strict: false });
        const repo = new GitGraphRepository(config, logger, templateRegistry);
        await repo.initIfNeeded();
        return repo;
      },
      inject: [ConfigService, LoggerService, ModuleRef],
    },
    AgentsPersistenceService,
  ],
  exports: [
    CoreModule,
    EnvModule,
    InfraModule,
    VaultModule,
    LLMModule,
    GraphRepository,
    NodesModule,
    AgentsPersistenceService,
    ThreadsMetricsService,
    RunSignalsRegistry,
    CallAgentLinkingService,
  ],
})
export class GraphDomainModule {}
