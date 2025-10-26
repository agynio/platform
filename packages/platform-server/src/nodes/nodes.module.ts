import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { LoggerService } from '../core/services/logger.service';
import { MongoService } from '../core/services/mongo.service';
import { LLMModule } from '../llm/llm.module';
// Agent and memory
import { AgentRunService } from './agentRun.repository';
// Nodes
import { AgentNode } from './agent/agent.node';
import { MemoryNode } from './memory/memory.node';
import { MemoryConnectorNode } from './memoryConnector/memoryConnector.node';
import { SlackTrigger } from './slackTrigger/slackTrigger.node';
import { WorkspaceNode } from './workspace/workspace.node';
// MCP
import { LocalMCPServer } from './mcp/localMcpServer.node';
// Tool nodes and tools
import { EnvModule } from '../env/env.module';
import { InfraModule } from '../infra/infra.module';
import { CallAgentNode } from './tools/call_agent/call_agent.node';
import { FinishNode } from './tools/finish/finish.node';
import { GithubCloneRepoNode } from './tools/github_clone_repo/github_clone_repo.node';
import { ManageToolNode } from './tools/manage/manage.node';
import { MemoryToolNode } from './tools/memory/memory.node';
import { RemindMeNode } from './tools/remind_me/remind_me.node';
import { RemindersController } from './tools/remind_me/reminders.controller';
import { SendSlackMessageNode } from './tools/send_slack_message/send_slack_message.node';
import { ShellCommandNode } from './tools/shell_command/shell_command.node';
import { GraphModule } from '../graph/graph.module';

@Module({
  imports: [CoreModule, LLMModule, InfraModule, EnvModule, GraphModule],
  controllers: [RemindersController],
  providers: [
    // repositories/services
    {
      provide: AgentRunService,
      useFactory: async (mongo: MongoService, logger: LoggerService) => {
        const svc = new AgentRunService(mongo, logger);
        await svc.ensureIndexes();
        return svc;
      },
      inject: [MongoService, LoggerService],
    },
    // MemoryService removed from providers; created transiently via ModuleRef
    // nodes
    AgentNode,
    MemoryNode,
    MemoryConnectorNode,
    WorkspaceNode,
    SlackTrigger,
    // mcp
    LocalMCPServer,
    // tools
    // Do not provide abstract BaseToolNode
    ManageToolNode,
    CallAgentNode,
    FinishNode,
    MemoryToolNode,
    SendSlackMessageNode,
    ShellCommandNode,
    GithubCloneRepoNode,
    RemindMeNode,
  ],
  exports: [AgentRunService],
})
export class NodesModule {}
