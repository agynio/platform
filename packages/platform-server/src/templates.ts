import { toJSONSchema } from 'zod';
import {
  ContainerProviderEntity,
  ContainerProviderExposedStaticConfigSchema,
} from './entities/containerProvider.entity';
import { TemplateRegistry } from './graph';
import { AgentNode, AgentStaticConfigSchema } from './nodes/agent/agent.node';

import { LocalMCPServer, LocalMcpServerStaticConfigSchema } from './nodes/mcp/localMcpServer.node';
import { MemoryNode, MemoryNodeStaticConfigSchema } from './nodes/memory/memory.node';
import { MemoryConnectorNode, MemoryConnectorStaticConfigSchema } from './nodes/memoryConnector/memoryConnector.node';
import { SlackTrigger, SlackTriggerExposedStaticConfigSchema } from './nodes/slackTrigger/slack.trigger';
import { CallAgentTool, CallAgentToolStaticConfigSchema } from './nodes/tools/call_agent/call_agent.node';
import { FinishTool, FinishToolStaticConfigSchema } from './nodes/tools/finish/finish.node';
import {
  GithubCloneRepoTool,
  GithubCloneRepoToolExposedStaticConfigSchema,
} from './nodes/tools/github_clone_repo/github_clone_repo.node';
import { ManageTool, ManageToolStaticConfigSchema } from './nodes/tools/manage/manage.node';
import { MemoryToolNode, MemoryToolNodeStaticConfigSchema } from './nodes/tools/memory/memory.node';
import { RemindMeTool, RemindMeToolStaticConfigSchema } from './nodes/tools/remind_me/remind_me.node';
import {
  SendSlackMessageTool,
  SendSlackMessageToolExposedStaticConfigSchema,
} from './nodes/tools/send_slack_message/send_slack_message.node';
import { ShellCommandNode, ShellToolStaticConfigSchema } from './nodes/tools/shell_command/shell_command.node';
import { ConfigService } from './services/config.service';
import { ContainerService } from './services/container.service';
import { EnvService } from './services/env.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { NcpsKeyService } from './services/ncpsKey.service';
import { VaultConfigSchema, VaultService } from './services/vault.service';
import { LLMFactoryService } from './services/llmFactory.service';
// Unified Memory tool

export interface TemplateRegistryDeps {
  logger: LoggerService;
  containerService: ContainerService;
  configService: ConfigService;
  mongoService: MongoService; // required for memory nodes
  llmFactoryService: LLMFactoryService;
  ncpsKeyService?: NcpsKeyService;
}

export function buildTemplateRegistry(deps: TemplateRegistryDeps): TemplateRegistry {
  const { logger, containerService, configService, mongoService, ncpsKeyService, llmFactoryService } = deps;

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
            ncpsKeyService,
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
        () => new ShellCommandNode(envService),
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
        () => new SendSlackMessageTool(logger, vault) as unknown as import('./graph/types').Configurable,
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
        () => new FinishTool(logger) as unknown as import('./graph/types').Configurable,
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
        () => new ManageTool(logger) as unknown as import('./graph/types').Configurable,
        {
          targetPorts: { $self: { kind: 'instance' } },
          sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } },
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
        () => new RemindMeTool(logger) as unknown as import('./graph/types').Configurable,
        {
          targetPorts: { $self: { kind: 'instance' } },
          sourcePorts: { caller: { kind: 'method', create: 'setCallerAgent' } },
        },
        {
          title: 'Remind Me',
          kind: 'tool',
          capabilities: { staticConfigurable: true },
          staticConfigSchema: toJSONSchema(RemindMeToolStaticConfigSchema),
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
        'agent',
        (ctx) => new AgentNode(configService, logger, llmFactoryService, ctx.nodeId),
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
          staticConfigSchema: toJSONSchema(AgentStaticConfigSchema),
        },
      )
      // Register a single unified Memory tool
      .register(
        'memoryTool',
        () => new MemoryToolNode(logger) as unknown as import('./graph/types').Configurable,
        { targetPorts: { $self: { kind: 'instance' }, $memory: { kind: 'method', create: 'setMemorySource' } } },
        {
          title: 'Memory Tool',
          kind: 'tool',
          capabilities: {},
          staticConfigSchema: toJSONSchema(MemoryToolNodeStaticConfigSchema),
        },
      )
      .register(
        'mcpServer',
        () => {
          const server = new LocalMCPServer(containerService, logger);
          server.setEnvService(envService);
          server.setVault(vault);
          // Wire global stale timeout and state persistor for cache persistence
          server.setGlobalStaleTimeoutMs(configService.mcpToolsStaleTimeoutMs);
          server.setStatePersistor((state) => deps.graphStateService.upsertNodeState(ctx.nodeId, state));
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
          new MemoryConnectorNode(() => {
            throw new Error('MemoryConnectorNode: memory factory not set');
          }),
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
