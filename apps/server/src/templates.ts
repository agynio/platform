import { toJSONSchema } from 'zod';
import { SimpleAgent, SimpleAgentStaticConfigSchema } from './agents/simple.agent';
import { ContainerProviderEntity, ContainerProviderStaticConfigSchema } from './entities/containerProvider.entity';
import { TemplateRegistry } from './graph';
import { LocalMCPServer } from './mcp';
import { CheckpointerService } from './services/checkpointer.service';
import { ConfigService } from './services/config.service';
import { ContainerService } from './services/container.service';
import { LoggerService } from './services/logger.service';
import { SlackService } from './services/slack.service';
import { CallAgentTool, CallAgentToolStaticConfigSchema } from './tools/call_agent.tool';
import { GithubCloneRepoTool, GithubCloneRepoToolStaticConfigSchema } from './tools/github_clone_repo';
import { SendSlackMessageTool, SendSlackMessageToolStaticConfigSchema } from './tools/send_slack_message.tool';
import { ShellTool, ShellToolStaticConfigSchema } from './tools/shell_command';
import { SlackTrigger } from './triggers';
import { SlackTriggerStaticConfigSchema } from './triggers/slack.trigger';
import { LocalMcpServerStaticConfigSchema } from './mcp/localMcpServer';
import { FinishTool, FinishToolStaticConfigSchema } from './tools/finish.tool';
import { MongoService } from './services/mongo.service';
import { MemoryNode, MemoryNodeStaticConfigSchema } from './nodes/memory.node';
import { MemoryConnectorNode, MemoryConnectorStaticConfigSchema } from './nodes/memory.connector.node';
import { MemoryReadTool, MemoryReadToolStaticConfigSchema } from './tools/memory/memory_read.tool';
import { MemoryListTool, MemoryListToolStaticConfigSchema } from './tools/memory/memory_list.tool';
import { MemoryAppendTool, MemoryAppendToolStaticConfigSchema } from './tools/memory/memory_append.tool';
import { MemoryUpdateTool, MemoryUpdateToolStaticConfigSchema } from './tools/memory/memory_update.tool';
import { MemoryDeleteTool, MemoryDeleteToolStaticConfigSchema } from './tools/memory/memory_delete.tool';
import { MemoryDumpTool, MemoryDumpToolStaticConfigSchema } from './tools/memory/memory_dump.tool';
import { DebugToolTrigger, DebugToolTriggerStaticConfigSchema } from './triggers/debugTool.trigger';
import { RemindMeTool, RemindMeToolStaticConfigSchema } from './tools/remind_me.tool';

export interface TemplateRegistryDeps {
  logger: LoggerService;
  containerService: ContainerService;
  configService: ConfigService;
  slackService: SlackService;
  checkpointerService: CheckpointerService;
  mongoService: MongoService; // required for memory nodes
}

export function buildTemplateRegistry(deps: TemplateRegistryDeps): TemplateRegistry {
  const { logger, containerService, configService, slackService, checkpointerService, mongoService } = deps;

  return (
    new TemplateRegistry()
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
        {
          title: 'Workspace',
          kind: 'service',
          capabilities: { staticConfigurable: true },
          staticConfigSchema: toJSONSchema(ContainerProviderStaticConfigSchema),
        },
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
        {
          title: 'Shell',
          kind: 'tool',
          capabilities: { staticConfigurable: true },
          staticConfigSchema: toJSONSchema(ShellToolStaticConfigSchema),
        },
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
      {
        title: 'Github clone',
        kind: 'tool',
        capabilities: { staticConfigurable: true },
        staticConfigSchema: toJSONSchema(GithubCloneRepoToolStaticConfigSchema),
      },
    )
    .register(
      'sendSlackMessageTool',
      () => new SendSlackMessageTool(slackService, logger),
      {
        targetPorts: { $self: { kind: 'instance' } },
      },
      {
        title: 'Send Slack message',
        kind: 'tool',
        capabilities: { staticConfigurable: true },
        staticConfigSchema: toJSONSchema(SendSlackMessageToolStaticConfigSchema),
      },
    )
    .register(
      'finishTool',
      () => new FinishTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' } },
      },
      {
        title: 'Finish',
        kind: 'tool',
        capabilities: { staticConfigurable: true },
        staticConfigSchema: toJSONSchema(FinishToolStaticConfigSchema),
      },
    )
    .register(
      'callAgentTool',
      () => new CallAgentTool(logger),
      {
        targetPorts: { $self: { kind: 'instance' } },
        sourcePorts: { agent: { kind: 'method', create: 'setAgent' } },
      },
      {
        title: 'Call agent',
        kind: 'tool',
        capabilities: { staticConfigurable: true },
        staticConfigSchema: toJSONSchema(CallAgentToolStaticConfigSchema),
      },
    )
    .register(
      'remindMeTool',
      () => new RemindMeTool(logger),
      { targetPorts: { $self: { kind: 'instance' } } },
      {
        title: 'Remind Me',
        kind: 'tool',
        capabilities: { staticConfigurable: true },
        staticConfigSchema: toJSONSchema(RemindMeToolStaticConfigSchema),
      },
    )
      .register(
        'debugTool',
        () => new DebugToolTrigger(logger),
        { targetPorts: { $tool: { kind: 'method', create: 'setTool' } } },
        {
          title: 'HTTP Debug Tool',
          kind: 'trigger',
          capabilities: { provisionable: true, staticConfigurable: true },
          staticConfigSchema: toJSONSchema(DebugToolTriggerStaticConfigSchema),
        },
      )
      .register(
        'slackTrigger',
        () => new SlackTrigger(slackService, logger),
        {
          sourcePorts: {
            // Preserve prior port naming: 'subscribe' handle to call instance.subscribe/unsubscribe
            subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' },
          },
        },
        {
          title: 'Slack (Socket Mode)',
          kind: 'trigger',
          capabilities: { provisionable: true, pausable: true, staticConfigurable: true },
          staticConfigSchema: toJSONSchema(SlackTriggerStaticConfigSchema),
        },
      )
      .register(
        'simpleAgent',
        (ctx) => new SimpleAgent(configService, logger, checkpointerService, ctx.nodeId),
        {
          sourcePorts: {
            tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' },
            mcp: { kind: 'method', create: 'addMcpServer', destroy: 'removeMcpServer' },
          },
          targetPorts: {
            $self: { kind: 'instance' },
            // Attach/detach memory connector via explicit methods on the agent
            memory: { kind: 'method', create: 'attachMemoryConnector', destroy: 'detachMemoryConnector' },
          },
        },
        {
          title: 'Agent',
          kind: 'agent',
          capabilities: { pausable: true, staticConfigurable: true },
          staticConfigSchema: toJSONSchema(SimpleAgentStaticConfigSchema),
        },
      )
      // Register memory tools individually so they appear as Tool nodes and can be wired to agent.tools
      .register(
        'memory_read',
        () => new MemoryReadTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory Read',
          kind: 'tool',
          capabilities: {},
          staticConfigSchema: toJSONSchema(MemoryReadToolStaticConfigSchema),
        },
      )
      .register(
        'memory_list',
        () => new MemoryListTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory List',
          kind: 'tool',
          capabilities: {},
          staticConfigSchema: toJSONSchema(MemoryListToolStaticConfigSchema),
        },
      )
      .register(
        'memory_append',
        () => new MemoryAppendTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory Append',
          kind: 'tool',
          capabilities: {},
          staticConfigSchema: toJSONSchema(MemoryAppendToolStaticConfigSchema),
        },
      )
      .register(
        'memory_update',
        () => new MemoryUpdateTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory Update',
          kind: 'tool',
          capabilities: {},
          staticConfigSchema: toJSONSchema(MemoryUpdateToolStaticConfigSchema),
        },
      )
      .register(
        'memory_delete',
        () => new MemoryDeleteTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory Delete',
          kind: 'tool',
          capabilities: {},
          staticConfigSchema: toJSONSchema(MemoryDeleteToolStaticConfigSchema),
        },
      )
      // TEMPORARY diagnostic tool to introspect memory structure without content.
      .register(
        'memory_dump',
        () => new MemoryDumpTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory Dump (TEMP)',
          kind: 'tool',
          capabilities: {},
          staticConfigSchema: toJSONSchema(MemoryDumpToolStaticConfigSchema),
        },
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
        {
          title: 'MCP Server',
          kind: 'mcp',
          capabilities: { provisionable: true, dynamicConfigurable: true, staticConfigurable: true },
          staticConfigSchema: toJSONSchema(LocalMcpServerStaticConfigSchema),
        },
      )
      // Memory: provide MemoryNode and MemoryConnectorNode as explicit templates with ports
      .register(
        'memory',
        (ctx) => {
          const db = mongoService.getDb();
          return new MemoryNode(db, ctx.nodeId, { scope: 'global' });
        },
        {
          // Expose only $self for instance wiring
          sourcePorts: { $self: { kind: 'instance' } },
        },
        {
          title: 'Memory',
          kind: 'service',
          capabilities: { provisionable: true, staticConfigurable: true },
          staticConfigSchema: toJSONSchema(MemoryNodeStaticConfigSchema),
        },
      )
      .register(
        'memoryConnector',
        () =>
          new MemoryConnectorNode(
            () => {
              throw new Error('MemoryConnectorNode: memory factory not set');
            },
            { placement: 'after_system', content: 'tree', maxChars: 4000 },
          ),
        {
          // Accept memory source (node or factory) from Memory node; expose self to Agent
          targetPorts: { $memory: { kind: 'method', create: 'setMemorySource' } },
          sourcePorts: { $self: { kind: 'instance' } },
        },
        {
          title: 'Memory Connector',
          kind: 'service',
          capabilities: { provisionable: true, staticConfigurable: true },
          staticConfigSchema: toJSONSchema(MemoryConnectorStaticConfigSchema),
        },
      )
  );
}
