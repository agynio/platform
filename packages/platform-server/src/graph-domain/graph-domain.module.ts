import { Global, Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { EventsModule } from '../events/events.module';
import { InfraModule } from '../infra/infra.module';
import { EnvModule } from '../env/env.module';
import { LLMModule } from '../llm/llm.module';
import { VaultModule } from '../vault/vault.module';
import { TeamsGraphSource } from '../graph/teamsGraph.source';
import { NodesModule } from '../nodes/nodes.module';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { RunSignalsRegistry } from '../agents/run-signals.service';
import { CallAgentLinkingService } from '../agents/call-agent-linking.service';
import { ThreadCleanupCoordinator } from '../agents/threadCleanup.coordinator';
import { RemindersService } from '../agents/reminders.service';
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
    AgentsPersistenceService,
  ],
  exports: [
    CoreModule,
    EnvModule,
    InfraModule,
    VaultModule,
    LLMModule,
    TeamsGraphSource,
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
