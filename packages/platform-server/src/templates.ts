import { toJSONSchema } from 'zod';
import { WorkspaceNode, ContainerProviderExposedStaticConfigSchema } from './nodes/workspace/workspace.node';
import { TemplateRegistry } from './graph';
import { AgentNode, AgentStaticConfigSchema } from './nodes/agent/agent.node';

import { LocalMCPServer, LocalMcpServerStaticConfigSchema } from './nodes/mcp/localMcpServer.node';
import { MemoryNode, MemoryNodeStaticConfigSchema } from './nodes/memory/memory.node';
import { MemoryConnectorNode, MemoryConnectorStaticConfigSchema } from './nodes/memoryConnector/memoryConnector.node';
import { SlackTrigger, SlackTriggerExposedStaticConfigSchema } from './nodes/slackTrigger/slackTrigger.node';
import { CallAgentTool, CallAgentToolStaticConfigSchema } from './nodes/tools/call_agent/call_agent.node';
import { FinishTool, FinishToolStaticConfigSchema } from './nodes/tools/finish/finish.node';
import {
  GithubCloneRepoNode,
  GithubCloneRepoToolExposedStaticConfigSchema,
} from './nodes/tools/github_clone_repo/github_clone_repo.node';
import { ManageTool, ManageToolStaticConfigSchema } from './nodes/tools/manage/manage.node';
import { MemoryToolNode, MemoryToolNodeStaticConfigSchema } from './nodes/tools/memory/memory.node';

import { RemindMeNode } from './nodes/tools/remind_me/remind_me.node';
import { RemindMeToolStaticConfigSchema } from './nodes/tools/remind_me/remind_me.tool';
import {
  SendSlackMessageTool,
  SendSlackMessageToolExposedStaticConfigSchema,
} from './nodes/tools/send_slack_message/send_slack_message.node';
import { ShellCommandNode, ShellToolStaticConfigSchema } from './nodes/tools/shell_command/shell_command.node';
import { ConfigService } from './core/services/config.service';
import { ContainerService } from './infra/container/container.service';
import { EnvService } from './graph/env.service';
import { LLMProvisioner } from './llm/provisioners/llm.provisioner';
import { LoggerService } from './core/services/logger.service';
import { MongoService } from './core/services/mongo.service';
import { NcpsKeyService } from './core/services/ncpsKey.service';
import { VaultService } from './infra/vault/vault.service';
import { NodeStateService } from './graph/nodeState.service';
// Unified Memory tool

export interface TemplateRegistryDeps {
  logger: LoggerService;
  containerService: ContainerService;
  configService: ConfigService;
  mongoService: MongoService; // required for memory nodes
  provisioner: LLMProvisioner;
  ncpsKeyService?: NcpsKeyService;
  // Provide NodeStateService deterministically; prefer provider to avoid construction cycles
  nodeStateServiceProvider?: () => NodeStateService | undefined;
}

export function buildTemplateRegistry(deps: TemplateRegistryDeps): TemplateRegistry {
  const { logger, containerService, configService, mongoService, ncpsKeyService, provisioner, nodeStateServiceProvider } = deps;

  // Initialize Vault service from config (optional)
  const vault = new VaultService(configService, logger);
  const envService = new EnvService(vault);

  const registry = new TemplateRegistry();
  registry.register(
    'workspace',
    { title: 'Workspace', kind: 'service', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(ContainerProviderExposedStaticConfigSchema) },
    WorkspaceNode,
  );
  registry.register(
    'shellTool',
    { title: 'Shell', kind: 'tool', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(ShellToolStaticConfigSchema) },
    ShellCommandNode,
    {
      targetPorts: {
        $self: { kind: 'instance' },
        workspace: { kind: 'method', create: 'setContainerProvider' },
      },
    },
  );
  registry.register(
    'githubCloneRepoTool',
    { title: 'Github clone', kind: 'tool', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(GithubCloneRepoToolExposedStaticConfigSchema) },
    GithubCloneRepoNode,
    {
      targetPorts: {
        $self: { kind: 'instance' },
        workspace: { kind: 'method', create: 'setContainerProvider' },
      },
    },
  );
  registry.register(
    'sendSlackMessageTool',
    { title: 'Send Slack message', kind: 'tool', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(SendSlackMessageToolExposedStaticConfigSchema) },
    SendSlackMessageTool as any,
    {
      targetPorts: { $self: { kind: 'instance' } },
    },
  );
  registry.register(
    'finishTool',
    { title: 'Finish', kind: 'tool', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(FinishToolStaticConfigSchema) },
    FinishTool as any,
    { targetPorts: { $self: { kind: 'instance' } } },
  );
  registry.register(
    'callAgentTool',
    { title: 'Call agent', kind: 'tool', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(CallAgentToolStaticConfigSchema) },
    CallAgentTool as any,
    { targetPorts: { $self: { kind: 'instance' } }, sourcePorts: { agent: { kind: 'method', create: 'setAgent' } } },
  );
  registry.register(
    'manageTool',
    { title: 'Manage', kind: 'tool', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(ManageToolStaticConfigSchema) },
    ManageTool as any,
    { targetPorts: { $self: { kind: 'instance' } }, sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } } },
  );
  registry.register(
    'remindMeTool',
    { title: 'Remind Me', kind: 'tool', capabilities: { staticConfigurable: true }, staticConfigSchema: toJSONSchema(RemindMeToolStaticConfigSchema) },
    RemindMeNode as any,
    { targetPorts: { $self: { kind: 'instance' } }, sourcePorts: { caller: { kind: 'method', create: 'setCallerAgent' } } },
  );
  registry.register(
    'slackTrigger',
    { title: 'Slack (Socket Mode)', kind: 'trigger', capabilities: { provisionable: true, pausable: true, staticConfigurable: true }, staticConfigSchema: toJSONSchema(SlackTriggerExposedStaticConfigSchema) },
    SlackTrigger as any,
    { sourcePorts: { subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' } } },
  );
  registry.register(
    'agent',
    { title: 'Agent', kind: 'agent', capabilities: { pausable: true, staticConfigurable: true }, staticConfigSchema: toJSONSchema(AgentStaticConfigSchema) },
    AgentNode,
    {
      sourcePorts: {
        tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' },
        mcp: { kind: 'method', create: 'addMcpServer', destroy: 'removeMcpServer' },
      },
      targetPorts: {
        $self: { kind: 'instance' },
        memory: { kind: 'method', create: 'attachMemoryConnector', destroy: 'detachMemoryConnector' },
      },
    },
  );
      // Register a single unified Memory tool
  registry.register(
    'memoryTool',
    { title: 'Memory Tool', kind: 'tool', capabilities: {}, staticConfigSchema: toJSONSchema(MemoryToolNodeStaticConfigSchema) },
    MemoryToolNode as any,
    { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
  );
  registry.register(
    'mcpServer',
    { title: 'MCP Server', kind: 'mcp', capabilities: { provisionable: true, dynamicConfigurable: true, staticConfigurable: true }, staticConfigSchema: toJSONSchema(LocalMcpServerStaticConfigSchema) },
    LocalMCPServer as any,
    { targetPorts: { $self: { kind: 'instance' }, workspace: { kind: 'method', create: 'setContainerProvider' } } },
  );
  // Memory: provide MemoryNode and MemoryConnectorNode as explicit templates with ports
  registry.register(
    'memory',
    { title: 'Memory', kind: 'service', capabilities: { provisionable: true, staticConfigurable: true }, staticConfigSchema: toJSONSchema(MemoryNodeStaticConfigSchema) },
    MemoryNode as any,
    { sourcePorts: { $self: { kind: 'instance' } } },
  );
  registry.register(
    'memoryConnector',
    { title: 'Memory Connector', kind: 'service', capabilities: { provisionable: true, staticConfigurable: true }, staticConfigSchema: toJSONSchema(MemoryConnectorStaticConfigSchema) },
    MemoryConnectorNode as any,
    { targetPorts: { $memory: { kind: 'method', create: 'setMemorySource' } }, sourcePorts: { $self: { kind: 'instance' } } },
  );
  

  return registry;
}
