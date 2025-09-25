import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/services/logger.service';
import { ContainerService } from '../src/services/container.service';
import { ConfigService } from '../src/services/config.service';
import { SlackService } from '../src/services/slack.service';
import { CheckpointerService } from '../src/services/checkpointer.service';

const logger = new LoggerService();

const mockDeps = {
  logger,
  containerService: new ContainerService(logger),
  configService: new ConfigService(),
  slackService: new SlackService(logger),
  checkpointerService: new CheckpointerService(logger),
};

describe('templates - simpleAgent memory port', () => {
  it('includes memory target port', () => {
    const reg = buildTemplateRegistry(mockDeps);
    const schemaArr = reg.toSchema();
    const simple = schemaArr.find((s) => s.name === 'simpleAgent');
    expect(simple).toBeTruthy();
    const ports = reg.getPortsMap();
    expect(ports.simpleAgent?.targetPorts?.memory).toBeTruthy();
    expect(ports.simpleAgent?.targetPorts?.memory.kind).toBe('method');
    expect(ports.simpleAgent?.targetPorts?.memory.create).toBe('setMemoryConnector');
  });
});
