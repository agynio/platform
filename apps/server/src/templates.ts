import { SimpleAgent } from './agents/simple.agent';
import { ContainerProviderEntity } from './entities/containerProvider.entity';
import { TemplateRegistry } from './graph';
import { LocalMCPServer, McpServerConfig } from './mcp';
import { CheckpointerService } from './services/checkpointer.service';
import { ConfigService } from './services/config.service';
import { ContainerService } from './services/container.service';
import { LoggerService } from './services/logger.service';
import { SlackService } from './services/slack.service';
import { CallAgentTool } from './tools/call_agent.tool';
import { GithubCloneRepoTool } from './tools/github_clone_repo';
import { SendSlackMessageTool } from './tools/send_slack_message.tool';
import { ShellTool } from './tools/shell_command';
import { SlackTrigger } from './triggers';
import type { Db } from 'mongodb';
import { MemoryNode } from './nodes/memory.node';
import { MemoryConnectorNode } from './nodes/memoryConnector.node';
import { MemoryReadTool } from './tools/memory/memory_read.tool';
import { MemoryListTool } from './tools/memory/memory_list.tool';
import { MemoryAppendTool } from './tools/memory/memory_append.tool';
import { MemoryUpdateTool } from './tools/memory/memory_update.tool';
import { MemoryDeleteTool } from './tools/memory/memory_delete.tool';

export interface TemplateRegistryDeps {
  logger: LoggerService;
  containerService: ContainerService;
  configService: ConfigService;
  slackService: SlackService;
  checkpointerService: CheckpointerService;
  db: Db;
}

export function buildTemplateRegistry(deps: TemplateRegistryDeps): TemplateRegistry {
  const { logger, containerService, configService, slackService, checkpointerService, db } = deps;

  return new TemplateRegistry()
    .register(
      'containerProvider',
      (ctx) =>
        new ContainerProviderEntity(
          containerService,
          {
            cmd: ['sleep', 'infinity'],
            workingDir: '/workspace',
          },
          (threadId) => ({ 'hautech.ai/thread_id': `${ctx.nodeId}__${threadId}` }),
        ),
      {
        sourcePorts: { $self: { kind: 'instance' } },
      },
      { title: 'Workspace', kind: 'tool' },
    )
    .register(
      'shellTool',
      () => new ShellTool(logger),
      {
        targetPorts: {
          $self: { kind: 'instance' },
          containerProvider: { kind: 'method', create: 'setContainerProvider' },
        },
      },
      { title: 'Shell', kind: 'tool' },
    )
    .register(
      'githubCloneRepoTool',
      () => new GithubCloneRepoTool(configService, logger),
      {
        targetPorts: {
          $self: { kind: 'instance' },
          containerProvider: { kind: 'method', create: 'setContainerProvider' },
        },
      },
      { title: 'Github clone', kind: 'tool' },
    )
    .register(
      'sendSlackMessageTool',
      () => new SendSlackMessageTool(slackService, logger),
      {
        targetPorts: { $self: { kind: 'instance' } },
      },
      { title: 'Send Slack message', kind: 'tool' },
    )
    .register(
      'callAgentTool',
      () => new CallAgentTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' } },
        sourcePorts: { agent: { kind: 'method', create: 'setAgent' } },
      },
      { title: 'Call agent', kind: 'tool' },
    )
    .register(
      'slackTrigger',
      () => {
        const trigger = new SlackTrigger(slackService, logger);
        void trigger.start();
        return trigger;
      },
      {
        sourcePorts: { subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' } },
      },
      { title: 'Slack trigger', kind: 'trigger' },
    )
    .register(
      'simpleAgent',
      (ctx) => new SimpleAgent(configService, logger, checkpointerService, ctx.nodeId),
      {
        sourcePorts: {
          tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' },
          mcp: { kind: 'method', create: 'addMcpServer', destroy: 'removeMcpServer' },
        },
        targetPorts: { $self: { kind: 'instance' }, memory: { kind: 'method', create: 'setMemoryConnector', destroy: 'clearMemoryConnector' } },
      },
      { title: 'Agent', kind: 'agent' },
    )
    .register(
      'memoryNode',
      (ctx) => {
        const node = new MemoryNode(logger, ctx.nodeId);
        node.setDb(db);
        return node;
      },
      {
        sourcePorts: { $self: { kind: 'instance' } },
      },
      { title: 'Memory', kind: 'tool' },
    )
    .register(
      'memoryConnector',
      () => new MemoryConnectorNode(logger),
      {
        sourcePorts: { $self: { kind: 'instance' } },
        targetPorts: { memory: { kind: 'method', create: 'setMemoryService', destroy: 'clearMemoryService' } },
      },
      { title: 'Memory Connector', kind: 'tool' },
    )
    .register(
      'memory_read',
      () => new MemoryReadTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' }, memory: { kind: 'method', create: 'setMemoryService' } },
      },
      { title: 'Memory Read', kind: 'tool' },
    )
    .register(
      'memory_list',
      () => new MemoryListTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' }, memory: { kind: 'method', create: 'setMemoryService' } },
      },
      { title: 'Memory List', kind: 'tool' },
    )
    .register(
      'memory_append',
      () => new MemoryAppendTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' }, memory: { kind: 'method', create: 'setMemoryService' } },
      },
      { title: 'Memory Append', kind: 'tool' },
    )
    .register(
      'memory_update',
      () => new MemoryUpdateTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' }, memory: { kind: 'method', create: 'setMemoryService' } },
      },
      { title: 'Memory Update', kind: 'tool' },
    )
    .register(
      'memory_delete',
      () => new MemoryDeleteTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' }, memory: { kind: 'method', create: 'setMemoryService' } },
      },
      { title: 'Memory Delete', kind: 'tool' },
    )
     .register(
     'mcpServer',
     () => {
       const server = new LocalMCPServer(containerService, logger);
       void server.start();
       return server;
      },
      {
        targetPorts: {
          $self: { kind: 'instance' },
          containerProvider: { kind: 'method', create: 'setContainerProvider' },
        },
      },
      { title: 'MCP Server', kind: 'mcp' },
    );
}
