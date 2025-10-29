import { TemplateRegistry } from './graph';
import { ModuleRef } from '@nestjs/core';
import { AgentNode } from './graph/nodes/agent/agent.node';
import { WorkspaceNode } from './graph/nodes/workspace/workspace.node';

import { LocalMCPServerNode } from './graph/nodes/mcp/localMcpServer.node';
import { MemoryNode } from './graph/nodes/memory/memory.node';
import { MemoryConnectorNode } from './graph/nodes/memoryConnector/memoryConnector.node';
import { SlackTrigger } from './graph/nodes/slackTrigger/slackTrigger.node';
import { CallAgentTool } from './graph/nodes/tools/call_agent/call_agent.node';
import { FinishTool } from './graph/nodes/tools/finish/finish.node';
import { GithubCloneRepoNode } from './graph/nodes/tools/github_clone_repo/github_clone_repo.node';
import { ManageToolNode } from './graph/nodes/tools/manage/manage.node';
import { MemoryToolNode } from './graph/nodes/tools/memory/memory.node';

import { ConfigService } from './core/services/config.service';
import { LoggerService } from './core/services/logger.service';
import { MongoService } from './core/services/mongo.service';

import { ContainerService } from './infra/container/container.service';
import { NcpsKeyService } from './infra/ncps/ncpsKey.service';
import { LLMProvisioner } from './llm/provisioners/llm.provisioner';
import { RemindMeNode } from './graph/nodes/tools/remind_me/remind_me.node';
import { ShellCommandNode } from './graph/nodes/tools/shell_command/shell_command.node';
import { SendSlackMessageNode } from './graph/nodes/tools/send_slack_message/send_slack_message.node';
// Unified Memory tool

export interface TemplateRegistryDeps {
  logger: LoggerService;
  containerService: ContainerService;
  configService: ConfigService;
  mongoService: MongoService; // required for memory nodes
  provisioner: LLMProvisioner;
  ncpsKeyService?: NcpsKeyService;
  moduleRef: ModuleRef;
}

export function buildTemplateRegistry(deps: TemplateRegistryDeps): TemplateRegistry {
  const registry = new TemplateRegistry(deps.moduleRef);
  registry.register(
    'workspace',
    {
      title: 'Workspace',
      kind: 'service',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    WorkspaceNode,
  );
  registry.register(
    'shellTool',
    {
      title: 'Shell',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    ShellCommandNode,
  );
  registry.register(
    'githubCloneRepoTool',
    {
      title: 'Github clone',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    GithubCloneRepoNode,
  );
  registry.register(
    'sendSlackMessageTool',
    {
      title: 'Send Slack message',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    SendSlackMessageNode,
  );
  registry.register(
    'finishTool',
    {
      title: 'Finish',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    FinishTool,
  );
  registry.register(
    'callAgentTool',
    {
      title: 'Call agent',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    CallAgentTool,
  );
  registry.register(
    'manageTool',
    {
      title: 'Manage',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    ManageToolNode,
  );
  registry.register(
    'remindMeTool',
    {
      title: 'Remind Me',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    RemindMeNode,
  );
  registry.register(
    'slackTrigger',
    {
      title: 'Slack (Socket Mode)',
      kind: 'trigger',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    SlackTrigger,
  );
  registry.register(
    'agent',
    {
      title: 'Agent',
      kind: 'agent',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    AgentNode,
  );
  // Register a single unified Memory tool
  registry.register(
    'memoryTool',
    {
      title: 'Memory Tool',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    MemoryToolNode,
  );
  registry.register(
    'mcpServer',
    {
      title: 'MCP Server',
      kind: 'mcp',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    LocalMCPServerNode,
  );
  // Memory: provide MemoryNode and MemoryConnectorNode as explicit templates with ports
  registry.register(
    'memory',
    {
      title: 'Memory',
      kind: 'service',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    MemoryNode,
  );
  registry.register(
    'memoryConnector',
    {
      title: 'Memory Connector',
      kind: 'service',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    MemoryConnectorNode,
  );

  return registry;
}
