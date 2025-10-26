import { toJSONSchema } from 'zod';
import { TemplateRegistry } from './graph';
import { ModuleRef } from '@nestjs/core';
import { AgentNode, AgentStaticConfigSchema } from './nodes/agent/agent.node';
import { ContainerProviderExposedStaticConfigSchema, WorkspaceNode } from './nodes/workspace/workspace.node';

import { LocalMCPServer, LocalMcpServerStaticConfigSchema } from './nodes/mcp/localMcpServer.node';
import { MemoryNode, MemoryNodeStaticConfigSchema } from './nodes/memory/memory.node';
import { MemoryConnectorNode, MemoryConnectorStaticConfigSchema } from './nodes/memoryConnector/memoryConnector.node';
import { SlackTrigger, SlackTriggerExposedStaticConfigSchema } from './nodes/slackTrigger/slackTrigger.node';
import { CallAgentTool, CallAgentToolStaticConfigSchema } from './nodes/tools/call_agent/call_agent.node';
import { FinishTool, FinishToolStaticConfigSchema } from './nodes/tools/finish/finish.node';
import { GithubCloneRepoNode } from './nodes/tools/github_clone_repo/github_clone_repo.node';
import { ManageToolNode, ManageToolStaticConfigSchema } from './nodes/tools/manage/manage.node';
import { MemoryToolNode, MemoryToolNodeStaticConfigSchema } from './nodes/tools/memory/memory.node';

import { ConfigService } from './core/services/config.service';
import { LoggerService } from './core/services/logger.service';
import { MongoService } from './core/services/mongo.service';

import { NodeStateService } from './graph/nodeState.service';
import { ContainerService } from './infra/container/container.service';
import { NcpsKeyService } from './infra/ncps/ncpsKey.service';
import { LLMProvisioner } from './llm/provisioners/llm.provisioner';
import { RemindMeNode } from './nodes/tools/remind_me/remind_me.node';
import { RemindMeToolStaticConfigSchema } from './nodes/tools/remind_me/remind_me.tool';
import {
  SendSlackMessageTool,
  SendSlackMessageToolExposedStaticConfigSchema,
} from './nodes/tools/send_slack_message/send_slack_message.node';
import { ShellCommandNode, ShellToolStaticConfigSchema } from './nodes/tools/shell_command/shell_command.node';
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
    WorkspaceNode as any,
  );
  registry.register(
    'shellTool',
    {
      title: 'Shell',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    ShellCommandNode as any,
  );
  registry.register(
    'githubCloneRepoTool',
    {
      title: 'Github clone',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    GithubCloneRepoNode as any,
  );
  registry.register(
    'sendSlackMessageTool',
    {
      title: 'Send Slack message',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    SendSlackMessageTool as any,
  );
  registry.register(
    'finishTool',
    {
      title: 'Finish',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    FinishTool as any,
  );
  registry.register(
    'callAgentTool',
    {
      title: 'Call agent',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    CallAgentTool as any,
  );
  registry.register(
    'manageTool',
    {
      title: 'Manage',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    ManageToolNode as any,
  );
  registry.register(
    'remindMeTool',
    {
      title: 'Remind Me',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    RemindMeNode as any,
  );
  registry.register(
    'slackTrigger',
    {
      title: 'Slack (Socket Mode)',
      kind: 'trigger',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    SlackTrigger as any,
  );
  registry.register(
    'agent',
    {
      title: 'Agent',
      kind: 'agent',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    AgentNode as any,
  );
  // Register a single unified Memory tool
  registry.register(
    'memoryTool',
    {
      title: 'Memory Tool',
      kind: 'tool',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    MemoryToolNode as any,
  );
  registry.register(
    'mcpServer',
    {
      title: 'MCP Server',
      kind: 'mcp',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    LocalMCPServer as any,
  );
  // Memory: provide MemoryNode and MemoryConnectorNode as explicit templates with ports
  registry.register(
    'memory',
    {
      title: 'Memory',
      kind: 'service',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    MemoryNode as any,
  );
  registry.register(
    'memoryConnector',
    {
      title: 'Memory Connector',
      kind: 'service',
      // capabilities/staticConfigSchema removed from palette per Issue #451
    },
    MemoryConnectorNode as any,
  );

  return registry;
}
