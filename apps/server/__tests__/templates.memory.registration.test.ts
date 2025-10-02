import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import type { LoggerService } from '../src/services/logger.service';
import type { ContainerService } from '../src/services/container.service';
import type { ConfigService } from '../src/services/config.service';
import type { SlackService } from '../src/services/slack.service';
import type { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';

// Build a registry and assert memory templates and agent memory port wiring are present.
describe('templates: memory registration and agent memory port', () => {
  it('registers memory and memoryConnector templates and exposes SimpleAgent memory target port', () => {
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
    const schema = reg.toSchema();

    expect(Object.keys(ports)).toContain('memory');
    expect(Object.keys(ports)).toContain('memoryConnector');
    expect(ports.simpleAgent).toBeTruthy();
    // Schema contains static config for memory and memoryConnector
    const memSchema = schema.find((s) => s.name === 'memory');
    expect(memSchema?.staticConfigSchema).toBeTruthy();
    const memConnSchema = schema.find((s) => s.name === 'memoryConnector');
    expect(memConnSchema?.staticConfigSchema).toBeTruthy();

    // Capabilities include staticConfigurable and exclude dynamicConfigurable
    expect(memSchema?.capabilities?.staticConfigurable).toBe(true);
    expect(memConnSchema?.capabilities?.staticConfigurable).toBe(true);
    expect(memSchema?.capabilities?.dynamicConfigurable).toBeUndefined();
    expect(memConnSchema?.capabilities?.dynamicConfigurable).toBeUndefined();
    // memory node exposes getService port; memoryConnector exposes $self
    const memorySources = ports.memory.sourcePorts!;
    expect(memorySources.getService).toBeTruthy();

    const memConnSources = ports.memoryConnector.sourcePorts!;
    expect(memConnSources.$self).toBeTruthy();

    const memConnTargets = ports.memoryConnector.targetPorts!;
    expect(memConnTargets.setMemoryFactory).toBeTruthy();

    // Memory tools exposed via memory sourcePorts.tools
    expect((ports.memory.sourcePorts as any).tools).toBeTruthy();

    const agentTargets = ports.simpleAgent.targetPorts!;
    expect(agentTargets.memory).toBeTruthy();
    // Method mapping to attach/detach memory connector
    expect((agentTargets.memory as any).kind).toBe('method');
    expect((agentTargets.memory as any).create).toBe('attachMemoryConnector');
    expect((agentTargets.memory as any).destroy).toBe('detachMemoryConnector');
  });
});
