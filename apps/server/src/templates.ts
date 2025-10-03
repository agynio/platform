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
import { RemindMeTool, RemindMeToolStaticConfigSchema } from './tools/remind_me.tool';

export interface TemplateRegistryDeps {
  logger: LoggerService;
  containerService: ContainerService;
  configService: ConfigService;
  slackService: SlackService;
  checkpointerService: CheckpointerService;
}

export function buildTemplateRegistry(deps: TemplateRegistryDeps): TemplateRegistry {
  const { logger, containerService, configService, slackService, checkpointerService } = deps;

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
      {
        title: 'Workspace',
        kind: 'tool',
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
      () => new FinishTool(),
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
      'slackTrigger',
      () => {
        const trigger = new SlackTrigger(slackService, logger);
        void trigger.start();
        return trigger;
      },
      {
        sourcePorts: { subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' } },
      },
      {
        title: 'Slack trigger',
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
        targetPorts: { $self: { kind: 'instance' } },
      },
      {
        title: 'Agent',
        kind: 'agent',
        capabilities: { pausable: true, staticConfigurable: true },
        staticConfigSchema: toJSONSchema(SimpleAgentStaticConfigSchema),
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
    );
}
