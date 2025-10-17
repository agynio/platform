import { toJSONSchema } from 'zod';
import { Agent, AgentStaticConfigSchema } from './nodes/agent.node';
import { ContainerProviderEntity, ContainerProviderExposedStaticConfigSchema } from './entities/containerProvider.entity';
import { TemplateRegistry } from './graph';
import { LocalMCPServer } from './nodes/mcp/local/local-mcp-server.node';
import { CheckpointerService } from './services/checkpointer.service';
import { ConfigService } from './services/config.service';
import { ContainerService } from './services/container.service';
import { LoggerService } from './services/logger.service';
import { VaultService, VaultConfigSchema } from './services/vault.service';
import { CallAgentTool, CallAgentToolStaticConfigSchema } from './nodes/tools/call-agent-tool.node';
import { GithubCloneRepoTool, GithubCloneRepoToolExposedStaticConfigSchema } from './nodes/tools/github-clone-repo-tool.node';
import { SendSlackMessageTool, SendSlackMessageToolExposedStaticConfigSchema } from './nodes/tools/send-slack-message-tool.node';
import { ShellTool, ShellToolStaticConfigSchema } from './nodes/tools/shell-tool.node';
import { SlackTrigger } from './nodes/triggers/slack.trigger.node';
import { SlackTriggerExposedStaticConfigSchema } from './nodes/triggers/slack.trigger.node';
import { RemindMeTool, RemindMeToolStaticConfigSchema } from './nodes/tools/remind-me-tool.node';
import { DebugToolTrigger, DebugToolTriggerStaticConfigSchema } from './nodes/triggers/debug-tool.trigger.node';
import { LocalMcpServerStaticConfigSchema } from './nodes/mcp/local/local-mcp-server.node';
import { FinishTool, FinishToolStaticConfigSchema } from './nodes/tools/finish-tool.node';
import { MongoService } from './services/mongo.service';
import { MemoryNode, MemoryNodeStaticConfigSchema } from './nodes/memory.node';
import { MemoryConnectorNode, MemoryConnectorStaticConfigSchema } from './nodes/memory.connector.node';
// Unified Memory tool
import { UnifiedMemoryTool, UnifiedMemoryToolNodeStaticConfigSchema } from './nodes/tools/memory-tool.node';

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
    logger,
  );

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
        { title: 'Workspace', kind: 'service', staticConfigSchema: toJSONSchema(ContainerProviderExposedStaticConfigSchema) },
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
        { title: 'Shell', kind: 'tool', staticConfigSchema: toJSONSchema(ShellToolStaticConfigSchema) },
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
        { title: 'Github clone', kind: 'tool', staticConfigSchema: toJSONSchema(GithubCloneRepoToolExposedStaticConfigSchema) },
      )
      .register(
        'sendSlackMessageTool',
        () => new SendSlackMessageTool(logger, vault),
        {
          targetPorts: { $self: { kind: 'instance' } },
        },
        { title: 'Send Slack message', kind: 'tool', staticConfigSchema: toJSONSchema(SendSlackMessageToolExposedStaticConfigSchema) },
      )
      .register(
        'finishTool',
        () => new FinishTool(logger),
        {
          targetPorts: { $self: { kind: 'instance' } },
        },
        { title: 'Finish', kind: 'tool', staticConfigSchema: toJSONSchema(FinishToolStaticConfigSchema) },
      )
      .register(
        'callAgentTool',
        () => new CallAgentTool(logger),
        {
          targetPorts: { $self: { kind: 'instance' } },
          sourcePorts: { agent: { kind: 'method', create: 'setAgent' } },
        },
        { title: 'Call agent', kind: 'tool', staticConfigSchema: toJSONSchema(CallAgentToolStaticConfigSchema) },
      )
      .register(
        'remindMeTool',
        () => new RemindMeTool(logger),
        { targetPorts: { $self: { kind: 'instance' } } },
        { title: 'Remind Me', kind: 'tool', staticConfigSchema: toJSONSchema(RemindMeToolStaticConfigSchema) },
      )
      .register(
        'debugTool',
        () => new DebugToolTrigger(logger),
        { targetPorts: { $tool: { kind: 'method', create: 'setTool' } } },
        { title: 'HTTP Debug Tool', kind: 'trigger', staticConfigSchema: toJSONSchema(DebugToolTriggerStaticConfigSchema) },
      )
      .register(
        'slackTrigger',
        () => new SlackTrigger(logger, vault),
        {
          sourcePorts: {
            // Preserve prior port naming: 'subscribe' handle to call instance.subscribe/unsubscribe
            subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' },
          },
        },
        { title: 'Slack (Socket Mode)', kind: 'trigger', staticConfigSchema: toJSONSchema(SlackTriggerExposedStaticConfigSchema) },
      )
      .register(
        'agent',
        (ctx) => new Agent(configService, logger, checkpointerService, ctx.nodeId),
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
        { title: 'Agent', kind: 'agent', staticConfigSchema: toJSONSchema(AgentStaticConfigSchema) },
      )
      // Register a single unified Memory tool
      .register(
        'memoryTool',
        () => new UnifiedMemoryTool(logger),
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        { title: 'Memory Tool', kind: 'tool', staticConfigSchema: toJSONSchema(UnifiedMemoryToolNodeStaticConfigSchema) },
      )
      .register(
        'mcpServer',
        () => new LocalMCPServer(containerService, logger),
        {
          targetPorts: {
            $self: { kind: 'instance' },
            containerProvider: { kind: 'method', create: 'setContainerProvider' },
          },
        },
        { title: 'MCP Server', kind: 'mcp', staticConfigSchema: toJSONSchema(LocalMcpServerStaticConfigSchema) },
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
        { title: 'Memory', kind: 'service', staticConfigSchema: toJSONSchema(MemoryNodeStaticConfigSchema) },
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
        { title: 'Memory Connector', kind: 'service', staticConfigSchema: toJSONSchema(MemoryConnectorStaticConfigSchema) },
      )
  );
}
