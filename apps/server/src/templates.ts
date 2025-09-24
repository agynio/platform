import { SimpleAgent } from './agents/simple.agent';
import { ContainerProviderEntity } from './entities/containerProvider.entity';
import { TemplateRegistry } from './graph';
import { LocalMCPServer, McpServerConfig } from './mcp';
import { CheckpointerService } from './services/checkpointer.service';
import { ConfigService } from './services/config.service';
import { ContainerService } from './services/container.service';
import { LoggerService } from './services/logger.service';
import { SlackService } from './services/slack.service';
<<<<<<< HEAD
import { CallAgentTool } from './tools/call_agent.tool';
import { GithubCloneRepoTool } from './tools/github_clone_repo';
import { SendSlackMessageTool } from './tools/send_slack_message.tool';
import { ShellTool } from './tools/shell_command';
=======
import { BashCommandTool } from './tools/bash_command';
import { CallAgentTool } from './tools/call_agent.tool';
import { GithubCloneRepoTool } from './tools/github_clone_repo';
import { SendSlackMessageTool } from './tools/send_slack_message.tool';
>>>>>>> 207a5ac (fix(ci): resolve ESLint errors in UI, split non-component exports; add module type for ESLint v9; implement summarization options in CallModelNode; adjust shouldSummarize logic; remove duplicate TemplatesContext)
import { SlackTrigger } from './triggers';

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
        targetPorts: { $self: { kind: 'instance' } },
      },
      { title: 'Agent', kind: 'agent' },
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
