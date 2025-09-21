import { TemplateRegistry } from './graph';
import { ContainerProviderEntity } from './entities/containerProvider.entity';
import { ContainerService } from './services/container.service';
import { LoggerService } from './services/logger.service';
import { BashCommandTool } from './tools/bash_command';
import { GithubCloneRepoTool } from './tools/github_clone_repo';
import { SendSlackMessageTool } from './tools/send_slack_message.tool';
import { SlackTrigger } from './triggers';
import { SimpleAgent } from './agents/simple.agent';
import { ConfigService } from './services/config.service';
import { SlackService } from './services/slack.service';
import { CheckpointerService } from './services/checkpointer.service';
import { LocalMCPServer, McpServerConfig } from './mcp';

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
      () =>
        new ContainerProviderEntity(
          containerService,
          {
            cmd: ['sleep', 'infinity'],
            workingDir: '/workspace',
          },
          (threadId) => ({ 'hautech.ai/thread_id': `architect_${threadId}` }),
        ),
      {
        sourcePorts: { $self: { kind: 'instance' } },
      },
    )
    .register('bashCommandTool', () => new BashCommandTool(logger), {
      targetPorts: {
        $self: { kind: 'instance' },
        containerProvider: { kind: 'method', create: 'setContainerProvider' },
      },
    })
    .register('githubCloneRepoTool', () => new GithubCloneRepoTool(configService, logger), {
      targetPorts: {
        $self: { kind: 'instance' },
        containerProvider: { kind: 'method', create: 'setContainerProvider' },
      },
    })
    .register('sendSlackMessageTool', () => new SendSlackMessageTool(slackService, logger), {
      targetPorts: { $self: { kind: 'instance' } },
    })
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
    )
    .register('simpleAgent', () => new SimpleAgent(configService, logger, checkpointerService), {
      sourcePorts: {
        tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' },
        mcp: { kind: 'method', create: 'addMcpServer' },
      },
      targetPorts: { $self: { kind: 'instance' } },
    })
    .register('mcpServer', () => new LocalMCPServer(containerService, logger), {
      targetPorts: {
        $self: { kind: 'instance' },
        containerProvider: { kind: 'method', create: 'setContainerProvider' },
      },
    });
}
