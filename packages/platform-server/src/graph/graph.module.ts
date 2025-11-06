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

import { buildTemplateRegistry } from '../templates';
import { GraphController } from './controllers/graph.controller';
import { GraphPersistController } from './controllers/graphPersist.controller';
import { RunsController } from './controllers/runs.controller';
import { GraphVariablesController } from './controllers/graphVariables.controller';
import { GraphVariablesService } from './services/graphVariables.service';
import { GitGraphRepository } from './gitGraph.repository';
import { GraphGuard } from './graph.guard';
import { GraphRepository } from './graph.repository';
import { MongoGraphRepository } from './graphMongo.repository';
import { LiveGraphRuntime } from './liveGraph.manager';
import { PortsRegistry } from './ports.registry';
import { TemplateRegistry } from './templateRegistry';
import { EnvModule } from '../env/env.module';
import { NodeStateService } from './nodeState.service';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';
import { RemindersController } from './nodes/tools/remind_me/reminders.controller';
import { AgentNode } from './nodes/agent/agent.node';
import { MemoryNode } from './nodes/memory/memory.node';
import { MemoryConnectorNode } from './nodes/memoryConnector/memoryConnector.node';
import { WorkspaceNode } from './nodes/workspace/workspace.node';
import { SlackTrigger } from './nodes/slackTrigger/slackTrigger.node';
import { LocalMCPServerNode } from './nodes/mcp';
import { ManageToolNode } from './nodes/tools/manage/manage.node';
import { ManageFunctionTool } from './nodes/tools/manage/manage.tool';
import { CallAgentNode } from './nodes/tools/call_agent/call_agent.node';
import { FinishNode } from './nodes/tools/finish/finish.node';
import { MemoryToolNode } from './nodes/tools/memory/memory.node';
import { SendSlackMessageNode } from './nodes/tools/send_slack_message/send_slack_message.node';
import { ShellCommandNode } from './nodes/tools/shell_command/shell_command.node';
import { GithubCloneRepoNode } from './nodes/tools/github_clone_repo/github_clone_repo.node';
import { RemindMeNode } from './nodes/tools/remind_me/remind_me.node';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { AgentsThreadsController } from '../agents/threads.controller';
import { AgentsRemindersController } from '../agents/reminders.controller';

@Module({
  imports: [CoreModule, InfraModule, LLMModule, EnvModule],
  controllers: [
    RunsController,
    GraphPersistController,
    GraphController,
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
    GraphSocketGateway,
    AgentsPersistenceService,

    //////// Nodes

    // MemoryService removed from providers; created transiently via ModuleRef
    // nodes
    AgentNode,
    MemoryNode,
    MemoryConnectorNode,
    WorkspaceNode,
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
    ShellCommandNode,
    GithubCloneRepoNode,
    RemindMeNode,
    // Standard DI for GraphVariablesService
    GraphVariablesService,
  ],
  exports: [LiveGraphRuntime, TemplateRegistry, PortsRegistry, GraphRepository, NodeStateService],
})
export class GraphModule {}
