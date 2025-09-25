import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../templates';
import { LoggerService } from '../services/logger.service';
import { ContainerService } from '../services/container.service';
import { ConfigService } from '../services/config.service';
import { SlackService } from '../services/slack.service';
import { CheckpointerService } from '../services/checkpointer.service';

function mockDeps() {
  const logger = new LoggerService();
  const containerService = new ContainerService(logger);
  const configService = new ConfigService({
    githubAppId: '1',
    githubAppPrivateKey: 'k',
    githubInstallationId: 'i',
    openaiApiKey: 'x',
    githubToken: 't',
    slackBotToken: 's',
    slackAppToken: 'sa',
    mongodbUrl: 'm',
  });
  const slackService = new SlackService(configService, logger);
  const checkpointerService = new CheckpointerService(logger as any);
  return { logger, containerService, configService, slackService, checkpointerService } as const;
}

describe('API /api/templates exposure for memory nodes and tools', () => {
  it('includes memoryNode, memoryConnector, and memory_* tools with expected ports', () => {
    const deps = mockDeps();
    const registry = buildTemplateRegistry(deps);
    const schema = registry.toSchema();

    const expectTemplate = (name: string) => {
      const entry = schema.find((s) => s.name === name);
      expect(entry).toBeDefined();
      return entry!;
    };

    // memoryNode
    const memNode = expectTemplate('memoryNode');
    expect(memNode.sourcePorts).toContain('$self');
    expect(memNode.targetPorts.length).toBe(0);

    // memoryConnector
    const memConn = expectTemplate('memoryConnector');
    expect(memConn.sourcePorts).toContain('$self');
    expect(memConn.targetPorts).toContain('memory');

    // tools
    const toolNames = ['memory_read', 'memory_list', 'memory_append', 'memory_update', 'memory_delete'];
    for (const n of toolNames) {
      const t = expectTemplate(n);
      expect(t.targetPorts).toContain('$self');
      expect(t.targetPorts).toContain('memory');
      // sourcePorts for tools should be empty
      expect(t.sourcePorts.length).toBe(0);
    }
  });
});
