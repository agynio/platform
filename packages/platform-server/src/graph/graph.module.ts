import { Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { MongoService } from '../core/services/mongo.service';
import { ContainerService } from '../infra/container/container.service';
import { InfraModule } from '../infra/infra.module';
import { NcpsKeyService } from '../infra/ncps/ncpsKey.service';
import { LLMModule } from '../llm/llm.module';
import { LLMProvisioner } from '../llm/provisioners/llm.provisioner';

import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { AgentsRemindersController } from '../agents/reminders.controller';
import { AgentsThreadsController } from '../agents/threads.controller';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { EnvModule } from '../env/env.module';
import { EnvService } from '../env/env.service';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';
import { SlackAdapter } from '../messaging/slack/slack.adapter';
import { buildTemplateRegistry } from '../templates';
import { GraphController } from './controllers/graph.controller';
import { GraphPersistController } from './controllers/graphPersist.controller';
import { GraphVariablesController } from './controllers/graphVariables.controller';
import { MemoryController } from './controllers/memory.controller';
import { RunsController } from './controllers/runs.controller';
import { GitGraphRepository } from './gitGraph.repository';
import { GraphGuard } from './graph.guard';
import { GraphRepository } from './graph.repository';
import { MongoGraphRepository } from './graphMongo.repository';
import { LiveGraphRuntime } from './liveGraph.manager';
import { AgentNode } from './nodes/agent/agent.node';
import { LocalMCPServerNode } from './nodes/mcp';
import { PostgresMemoryRepository } from './nodes/memory.repository';
import { MemoryService } from './nodes/memory.service';
import { MemoryNode } from './nodes/memory/memory.node';
import { MemoryConnectorNode } from './nodes/memoryConnector/memoryConnector.node';
import { SlackTrigger } from './nodes/slackTrigger/slackTrigger.node';
import { CallAgentNode } from './nodes/tools/call_agent/call_agent.node';
import { FinishNode } from './nodes/tools/finish/finish.node';
import { GithubCloneRepoNode } from './nodes/tools/github_clone_repo/github_clone_repo.node';
import { ManageToolNode } from './nodes/tools/manage/manage.node';
import { ManageFunctionTool } from './nodes/tools/manage/manage.tool';
import { MemoryToolNode } from './nodes/tools/memory/memory.node';
import { RemindMeNode } from './nodes/tools/remind_me/remind_me.node';
import { RemindersController } from './nodes/tools/remind_me/reminders.controller';
import { SendMessageNode } from './nodes/tools/send_message/send_message.node';
import { SendSlackMessageNode } from './nodes/tools/send_slack_message/send_slack_message.node';
import { ShellCommandNode } from './nodes/tools/shell_command/shell_command.node';
import { WorkspaceNode } from './nodes/workspace/workspace.node';
import { NodeStateService } from './nodeState.service';
import { PortsRegistry } from './ports.registry';
import { GraphVariablesService } from './services/graphVariables.service';
import { TemplateRegistry } from './templateRegistry';

@Module({
  imports: [CoreModule, InfraModule, LLMModule, EnvModule],
  controllers: [
    RunsController,
    GraphPersistController,
    GraphController,
    MemoryController,
    RemindersController,
    GraphVariablesController,
    AgentsThreadsController,
    AgentsRemindersController,
  ],
  providers: [
    {
      provide: GraphGuard,
      useClass: GraphGuard,
    },
    TemplateRegistry,
    {
      provide: TemplateRegistry,
      useFactory: (
        logger: LoggerService,
        containerService: ContainerService,
        configService: ConfigService,
        mongoService: MongoService,
        provisioner: LLMProvisioner,
        ncpsKeyService: NcpsKeyService,
        module: ModuleRef,
      ) =>
        buildTemplateRegistry({
          logger,
          containerService,
          configService,
          mongoService,
          provisioner,
          ncpsKeyService,
          moduleRef: module,
        }),
      inject: [LoggerService, ContainerService, ConfigService, MongoService, LLMProvisioner, NcpsKeyService, ModuleRef],
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
    LiveGraphRuntime,
    NodeStateService,
    // Gateway and publisher binding
    GraphSocketGateway,
    // Centralized threads metrics aggregator
    ThreadsMetricsService,
    AgentsPersistenceService,
    // Messaging adapters
    SlackAdapter,
    // PrismaService is injected by type; no string token aliasing required

    //////// Nodes

    // Provide MemoryService and repository as singletons
    PostgresMemoryRepository,
    MemoryService,
    // nodes
    AgentNode,
    MemoryNode,
    MemoryConnectorNode,
    {
      provide: WorkspaceNode,
      useFactory: (
        containerService: ContainerService,
        configService: ConfigService,
        ncpsKeyService: NcpsKeyService,
        logger: LoggerService,
        envService: EnvService,
      ) => new WorkspaceNode(containerService, configService, ncpsKeyService, logger, envService),
      inject: [ContainerService, ConfigService, NcpsKeyService, LoggerService, EnvService],
    },
    SlackTrigger,
    // mcp
    LocalMCPServerNode,
    // tools
    // Do not provide abstract BaseToolNode
    ManageToolNode,
    ManageFunctionTool,
    CallAgentNode,
    FinishNode,
    MemoryToolNode,
    SendSlackMessageNode,
    SendMessageNode,
    ShellCommandNode,
    GithubCloneRepoNode,
    RemindMeNode,
    // Standard DI for GraphVariablesService
    GraphVariablesService,
  ],
  exports: [
    LiveGraphRuntime,
    TemplateRegistry,
    PortsRegistry,
    GraphRepository,
    NodeStateService,
    ThreadsMetricsService,
  ],
})
export class GraphModule {}
