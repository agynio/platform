import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import type { LoggerService } from '../src/services/logger.service';
import type { ContainerService } from '../src/services/container.service';
import type { ConfigService } from '../src/services/config.service';
import type { SlackService } from '../src/services/slack.service';
import type { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';

// Build a registry and assert memory template and agent memory port wiring are present.
describe('templates: memory registration and agent memory port', () => {
  it('registers memoryNode template and exposes SimpleAgent memory target port', () => {
    const deps = {
      logger: {} as unknown as LoggerService,
      containerService: {} as unknown as ContainerService,
      configService: {} as unknown as ConfigService,
      slackService: {} as unknown as SlackService,
      checkpointerService: {} as unknown as CheckpointerService,
      mongoService: { getDb: () => ({} as any) } as unknown as MongoService,
    };

    const reg = buildTemplateRegistry(deps);
    const ports = reg.getPortsMap();

    expect(Object.keys(ports)).toContain('memoryNode');
    expect(ports.simpleAgent).toBeTruthy();
    const agentTargets = ports.simpleAgent.targetPorts!;
    expect(agentTargets.memory).toBeTruthy();
    // Method mapping to attach/detach memory connector
    expect((agentTargets.memory as any).kind).toBe('method');
    expect((agentTargets.memory as any).create).toBe('attachMemoryConnector');
    expect((agentTargets.memory as any).destroy).toBe('detachMemoryConnector');
  });
});
