import { forwardRef, Inject, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CoreModule } from '../core/core.module';
import { EnvModule } from '../env/env.module';
import { EventsModule } from '../events/events.module';
import { InfraModule } from '../infra/infra.module';
import { LLMModule } from '../llm/llm.module';
import { PostgresMemoryEntitiesRepository } from './memory/memory.repository';
import { MemoryService } from './memory/memory.service';
import { MemoryNode } from './memory/memory.node';
import { MemoryConnectorNode } from './memoryConnector/memoryConnector.node';
import { AgentNode } from './agent/agent.node';
import { SlackTrigger } from './slackTrigger/slackTrigger.node';
import { SlackAdapter } from '../messaging/slack/slack.adapter';
import { ThreadTransportService } from '../messaging/threadTransport.service';
import { LocalMCPServerNode } from './mcp';
import { ManageToolNode } from './tools/manage/manage.node';
import { CallAgentNode } from './tools/call_agent/call_agent.node';
import { FinishNode } from './tools/finish/finish.node';
import { MemoryToolNode } from './tools/memory/memory.node';
import { SendSlackMessageNode } from './tools/send_slack_message/send_slack_message.node';
import { SendMessageNode } from './tools/send_message/send_message.node';
import { ShellCommandNode } from './tools/shell_command/shell_command.node';
import { GithubCloneRepoNode } from './tools/github_clone_repo/github_clone_repo.node';
import { RemindMeNode } from './tools/remind_me/remind_me.node';
import { WorkspaceNode } from './workspace/workspace.node';
import { ContainerService } from '../infra/container/container.service';
import { ConfigService } from '../core/services/config.service';
import { NcpsKeyService } from '../infra/ncps/ncpsKey.service';
import { EnvService } from '../env/env.service';
import { GraphCoreModule } from '../graph-core/graph-core.module';
import { TemplateRegistry } from '../graph-core/templateRegistry';
import { registerDefaultTemplates } from '../templates';

@Injectable()
class NodesTemplateRegistrar implements OnModuleInit {
  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  async onModuleInit(): Promise<void> {
    const registry = await this.moduleRef.resolve(TemplateRegistry, undefined, { strict: false });
    if (!registry) return;
    registerDefaultTemplates(registry);
  }
}

@Module({
  imports: [CoreModule, EnvModule, EventsModule, InfraModule, LLMModule, forwardRef(() => GraphCoreModule)],
  providers: [
    SlackAdapter,
    ThreadTransportService,
    PostgresMemoryEntitiesRepository,
    MemoryService,
    MemoryNode,
    MemoryConnectorNode,
    AgentNode,
    SlackTrigger,
    LocalMCPServerNode,
    ManageToolNode,
    CallAgentNode,
    FinishNode,
    MemoryToolNode,
    SendSlackMessageNode,
    SendMessageNode,
    ShellCommandNode,
    GithubCloneRepoNode,
    RemindMeNode,
    NodesTemplateRegistrar,
    {
      provide: WorkspaceNode,
      useFactory: (
        containerService: ContainerService,
        configService: ConfigService,
        ncpsKeyService: NcpsKeyService,
        envService: EnvService,
      ) => new WorkspaceNode(containerService, configService, ncpsKeyService, envService),
      inject: [ContainerService, ConfigService, NcpsKeyService, EnvService],
    },
  ],
  exports: [
    SlackAdapter,
    ThreadTransportService,
    PostgresMemoryEntitiesRepository,
    MemoryService,
    MemoryNode,
    MemoryConnectorNode,
    AgentNode,
    SlackTrigger,
    LocalMCPServerNode,
    ManageToolNode,
    CallAgentNode,
    FinishNode,
    MemoryToolNode,
    SendSlackMessageNode,
    SendMessageNode,
    ShellCommandNode,
    GithubCloneRepoNode,
    RemindMeNode,
    WorkspaceNode,
  ],
})
export class NodesModule {}
