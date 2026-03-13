import { Global, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { EventsModule } from '../events/events.module';
import { InfraModule } from '../infra/infra.module';
import { EnvModule } from '../env/env.module';
import { LLMModule } from '../llm/llm.module';
import { VaultModule } from '../vault/vault.module';
import { GraphRepository } from '../graph/graph.repository';
import { FsGraphRepository } from '../graph/fsGraph.repository';
import { HybridGraphRepository } from '../graph/hybridGraph.repository';
import { TeamsGraphSource } from '../graph/teamsGraph.source';
import { NodesModule } from '../nodes/nodes.module';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { RunSignalsRegistry } from '../agents/run-signals.service';
import { CallAgentLinkingService } from '../agents/call-agent-linking.service';
import { ThreadCleanupCoordinator } from '../agents/threadCleanup.coordinator';
import { RemindersService } from '../agents/reminders.service';
import { TemplateRegistry } from '../graph-core/templateRegistry';
import { TeamsModule } from '../teams/teams.module';

@Global()
@Module({
  imports: [CoreModule, EnvModule, EventsModule, InfraModule, VaultModule, LLMModule, NodesModule, TeamsModule],
  providers: [
    ThreadsMetricsService,
    RunSignalsRegistry,
    CallAgentLinkingService,
    ThreadCleanupCoordinator,
    RemindersService,
    TeamsGraphSource,
    {
      provide: GraphRepository,
      useFactory: async (config: ConfigService, moduleRef: ModuleRef, teamsSource: TeamsGraphSource) => {
        const templateRegistry = await moduleRef.resolve(TemplateRegistry, undefined, { strict: false });
        const fsRepo = new FsGraphRepository(config, templateRegistry);
        await fsRepo.initIfNeeded();
        return new HybridGraphRepository(fsRepo, teamsSource);
      },
      inject: [ConfigService, ModuleRef, TeamsGraphSource],
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
    ThreadCleanupCoordinator,
    ThreadsMetricsService,
    RunSignalsRegistry,
    CallAgentLinkingService,
    RemindersService,
  ],
})
export class GraphDomainModule {}
