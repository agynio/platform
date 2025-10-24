import { Module } from '@nestjs/common';
// Agent and memory
import { AgentRunService } from './agentRun.repository';
import { MemoryService } from './memory.repository';
// Nodes
import { AgentNode } from './agent/agent.node';
import { MemoryNode } from './memory/memory.node';
import { MemoryConnectorNode } from './memoryConnector/memoryConnector.node';
import { WorkspaceNode } from './workspace/workspace.node';
import { SlackTrigger } from './slackTrigger/slack.trigger';
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
  controllers: [RemindersController],
  providers: [
    // repositories/services
    AgentRunService,
    MemoryService,
    // nodes
    AgentNode,
    MemoryNode,
    MemoryConnectorNode,
    WorkspaceNode,
    SlackTrigger,
    // mcp
    LocalMCPServer,
    // tools
    BaseToolNode,
    ManageTool,
    CallAgentTool,
    FinishTool,
    MemoryToolNode,
    SendSlackMessageTool,
    ShellCommandNode,
    GithubCloneRepoNode,
    RemindMeNode,
  ],
  exports: [],
})
export class NodesModule {}

