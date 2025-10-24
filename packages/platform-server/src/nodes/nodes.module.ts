import { Module, Scope } from '@nestjs/common';
import { MongoService } from '../core/services/mongo.service';
import { LoggerService } from '../core/services/logger.service';
import { LLMModule } from '../llm/llm.module';
import { CoreModule } from '../core/core.module';
// Agent and memory
import { AgentRunService } from './agentRun.repository';
import { MemoryService } from './memory.repository';
// Nodes
import { AgentNode } from './agent/agent.node';
import { MemoryNode } from './memory/memory.node';
import { MemoryConnectorNode } from './memoryConnector/memoryConnector.node';
import { WorkspaceNode } from './workspace/workspace.node';
import { SlackTrigger } from './slackTrigger/slackTrigger.node';
// MCP
import { LocalMCPServer } from './mcp/localMcpServer.node';
// Tool nodes and tools
import { BaseToolNode } from './tools/baseToolNode';
import { ManageTool } from './tools/manage/manage.node';
import { CallAgentTool } from './tools/call_agent/call_agent.node';
import { FinishTool } from './tools/finish/finish.node';
import { MemoryToolNode } from './tools/memory/memory.node';
import { SendSlackMessageTool } from './tools/send_slack_message/send_slack_message.node';
import { ShellCommandNode } from './tools/shell_command/shell_command.node';
import { GithubCloneRepoNode } from './tools/github_clone_repo/github_clone_repo.node';
import { RemindMeNode } from './tools/remind_me/remind_me.node';
import { RemindersController } from './tools/remind_me/reminders.controller';

@Module({
  imports: [CoreModule, LLMModule],
  controllers: [RemindersController],
  providers: [
    // repositories/services
    {
      provide: AgentRunService,
      useFactory: async (mongo: MongoService, logger: LoggerService) => {
        const svc = new AgentRunService(mongo.getDb(), logger);
        await svc.ensureIndexes();
        return svc;
      },
      inject: [MongoService, LoggerService],
    },
    MemoryService,
    // nodes
    { provide: AgentNode, useClass: AgentNode, scope: Scope.TRANSIENT },
    { provide: MemoryNode, useClass: MemoryNode, scope: Scope.TRANSIENT },
    { provide: MemoryConnectorNode, useClass: MemoryConnectorNode, scope: Scope.TRANSIENT },
    { provide: WorkspaceNode, useClass: WorkspaceNode, scope: Scope.TRANSIENT },
    { provide: SlackTrigger, useClass: SlackTrigger, scope: Scope.TRANSIENT },
    // mcp
    { provide: LocalMCPServer, useClass: LocalMCPServer, scope: Scope.TRANSIENT },
    // tools
    { provide: BaseToolNode, useClass: BaseToolNode, scope: Scope.TRANSIENT },
    { provide: ManageTool, useClass: ManageTool, scope: Scope.TRANSIENT },
    { provide: CallAgentTool, useClass: CallAgentTool, scope: Scope.TRANSIENT },
    { provide: FinishTool, useClass: FinishTool, scope: Scope.TRANSIENT },
    { provide: MemoryToolNode, useClass: MemoryToolNode, scope: Scope.TRANSIENT },
    { provide: SendSlackMessageTool, useClass: SendSlackMessageTool, scope: Scope.TRANSIENT },
    { provide: ShellCommandNode, useClass: ShellCommandNode, scope: Scope.TRANSIENT },
    { provide: GithubCloneRepoNode, useClass: GithubCloneRepoNode, scope: Scope.TRANSIENT },
    { provide: RemindMeNode, useClass: RemindMeNode, scope: Scope.TRANSIENT },
  ],
  exports: [AgentRunService],
})
export class NodesModule {}
