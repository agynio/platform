import { toJSONSchema } from 'zod';
import { SimpleAgent, SimpleAgentStaticConfigSchema } from './agents/simple.agent';
import { ContainerProviderEntity, ContainerProviderExposedStaticConfigSchema } from './entities/containerProvider.entity';
import { TemplateRegistry } from './graph';
import { LocalMCPServer } from './mcp';
import { CheckpointerService } from './services/checkpointer.service';
import { ConfigService } from './services/config.service';
import { ContainerService } from './services/container.service';
import { LoggerService } from './services/logger.service';
import { VaultService, VaultConfigSchema } from './services/vault.service';
import { EnvService } from './services/env.service';
import { CallAgentTool, CallAgentToolStaticConfigSchema } from './tools/call_agent.tool';
import { ManageTool, ManageToolStaticConfigSchema } from './tools/manage.tool';
import { GithubCloneRepoTool, GithubCloneRepoToolExposedStaticConfigSchema } from './tools/github_clone_repo';
import { SendSlackMessageTool, SendSlackMessageToolExposedStaticConfigSchema } from './tools/send_slack_message.tool';
import { ShellTool, ShellToolStaticConfigSchema } from './tools/shell_command';
import { SlackTrigger } from './triggers';
import { SlackTriggerExposedStaticConfigSchema } from './triggers/slack.trigger';
import { RemindMeTool, RemindMeToolStaticConfigSchema } from './tools/remind_me.tool';
import { DebugToolTrigger, DebugToolTriggerStaticConfigSchema } from './triggers/debugTool.trigger';
import { LocalMcpServerStaticConfigSchema } from './mcp/localMcpServer';
import { FinishTool, FinishToolStaticConfigSchema } from './tools/finish.tool';
import { MongoService } from './services/mongo.service';
import { MemoryNode, MemoryNodeStaticConfigSchema } from './nodes/memory.node';
import { MemoryConnectorNode, MemoryConnectorStaticConfigSchema } from './nodes/memory.connector.node';
// Unified Memory tool
import { UnifiedMemoryTool, UnifiedMemoryToolNodeStaticConfigSchema } from './tools/memory/memory.tool';

export interface TemplateRegistryDeps {
  logger: LoggerService;
  containerService: ContainerService;
  configService: ConfigService;
  checkpointerService: CheckpointerService;
  mongoService: MongoService; // required for memory nodes
}

export function buildTemplateRegistry(deps: TemplateRegistryDeps): TemplateRegistry {
  const { logger, containerService, configService, checkpointerService, mongoService } = deps;

  // Initialize Vault service from config (optional)
  const vault = new VaultService(
    VaultConfigSchema.parse({
      enabled: configService.vaultEnabled,
      addr: configService.vaultAddr,
      token: configService.vaultToken,
      defaultMounts: ['secret'],
    }),
    logger
  );
  const envService = new EnvService(vault);

  return (
    new TemplateRegistry()
      .register(
        'containerProvider',
        (ctx) =>
          new ContainerProviderEntity(
            containerService,
            vault,
            {
              cmd: ['sleep', 'infinity'],
              workingDir: '/workspace',
              // Attach workspace containers to the shared user-defined bridge so they can
              // resolve registry-mirror by name and share network with DinD sidecar
              createExtras: {
                HostConfig: { NetworkMode: 'agents_net' },
                NetworkingConfig: {
                  // dockerode expects a map of network name to EndpointSettings; all fields are optional
                  // Using an empty object is valid and avoids any casts.
                  EndpointsConfig: { agents_net: {} },
                },
              },
            },
            (threadId) => ({ 'hautech.ai/thread_id': `${ctx.nodeId}__${threadId}` }),
            configService,
          ),
        {
          sourcePorts: { $self: { kind: 'instance' } },
        },
        {
          title: 'Workspace',
          kind: 'service',
          capabilities: { staticConfigurable: true },
          staticConfigSchema: toJSONSchema(ContainerProviderExposedStaticConfigSchema),
        },
      )
      .register(
        'shellTool',
        () => new ShellTool(vault, logger),
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
        () => new GithubCloneRepoTool(configService, vault, logger),
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
          staticConfigSchema: toJSONSchema(GithubCloneRepoToolExposedStaticConfigSchema),
        },
      )
      .register(
        'sendSlackMessageTool',
        () => new SendSlackMessageTool(logger, vault),
        {
          targetPorts: { $self: { kind: 'instance' } },
        },
        {
          title: 'Send Slack message',
          kind: 'tool',
          capabilities: { staticConfigurable: true },
          staticConfigSchema: toJSONSchema(SendSlackMessageToolExposedStaticConfigSchema),
        },
      )
      .register(
        'finishTool',
        () => (new FinishTool(logger) as unknown as import('./graph/types').Configurable),
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
        'manageTool',
        () => new ManageTool(logger),
        {
          targetPorts: { $self: { kind: 'instance' } },
          sourcePorts: { agent: { kind: 'method', create: 'addAgent', destroy: 'removeAgent' } },
        },
        {
          title: 'Manage',
          kind: 'tool',
          capabilities: { staticConfigurable: true },
          staticConfigSchema: toJSONSchema(ManageToolStaticConfigSchema),
        },
      )
      .register(
        'remindMeTool',
        () => (new RemindMeTool(logger) as unknown as import('./graph/types').Configurable),
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
        () => {
          const instance = new SlackTrigger(logger, vault);
          return instance;
        },
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
          staticConfigSchema: toJSONSchema(SlackTriggerExposedStaticConfigSchema),
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
      // Register a single unified Memory tool
      .register(
        'memoryTool',
        () => new UnifiedMemoryTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory Tool',
          kind: 'tool',
          capabilities: {},
          // Expose node-level static config (name/description/title), not invocation schema
          staticConfigSchema: toJSONSchema(UnifiedMemoryToolNodeStaticConfigSchema),
        },
      )
      .register(
        'mcpServer',
        () => {
          const server = new LocalMCPServer(containerService, logger);
          server.setEnvService(envService);
          server.setVault(vault);
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
          return new MemoryNode(db, ctx.nodeId);
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
