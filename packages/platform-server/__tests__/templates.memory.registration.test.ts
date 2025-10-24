import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import type { LoggerService } from '../src/core/services/logger.service.js';
import type { ContainerService } from '../src/core/services/container.service.js';
import type { ConfigService } from '../src/core/services/config.service.js';
import type { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/core/services/mongo.service.js';

// Build a registry and assert memory templates and agent memory port wiring are present.
describe('templates: memory registration and agent memory port', () => {
  it('registers memory and memoryConnector templates and exposes Agent memory target port', async () => {
    const deps = {
      logger: {} as unknown as LoggerService,
      containerService: {} as unknown as ContainerService,
      configService: {} as unknown as ConfigService,
      slackService: {} as unknown as any,
      checkpointerService: {} as unknown as CheckpointerService,
      mongoService: { getDb: () => ({} as any) } as unknown as MongoService,
    };

    const reg = buildTemplateRegistry(deps);
    const schema = await reg.toSchema();

    const memorySchema = schema.find((s) => s.name === 'memory');
    const memoryConnectorSchema = schema.find((s) => s.name === 'memoryConnector');
    const agentSchema = schema.find((s) => s.name === 'agent');
    expect(memorySchema).toBeTruthy();
    expect(memoryConnectorSchema).toBeTruthy();
    expect(agentSchema).toBeTruthy();
    // Schema contains static config for memory and memoryConnector
    const memSchema = schema.find((s) => s.name === 'memory');
    // Memory and MemoryConnector are services
    expect(memSchema?.kind).toBe('service');
    const memConnMeta = schema.find((s) => s.name === 'memoryConnector');
    expect(memConnMeta?.kind).toBe('service');
    const workspaceMeta = schema.find((s) => s.name === 'workspace');
    expect(workspaceMeta?.kind).toBe('service');
    expect(memSchema?.staticConfigSchema).toBeTruthy();
    const memConnSchema = schema.find((s) => s.name === 'memoryConnector');
    expect(memConnSchema?.staticConfigSchema).toBeTruthy();

    // Capabilities include staticConfigurable and exclude dynamicConfigurable
    expect(memSchema?.capabilities?.staticConfigurable).toBe(true);
    expect(memConnSchema?.capabilities?.staticConfigurable).toBe(true);
    expect(memSchema?.capabilities?.dynamicConfigurable).toBeUndefined();
    expect(memConnSchema?.capabilities?.dynamicConfigurable).toBeUndefined();
    // memory node exposes only $self; memoryConnector exposes $self and $memory target
    const memorySources = memorySchema?.sourcePorts || [];
    expect(memorySources).toContain('$self');

    const memConnSources = memoryConnectorSchema?.sourcePorts || [];
    expect(memConnSources).toContain('$self');

    const memConnTargets = memoryConnectorSchema?.targetPorts || [];
    expect(memConnTargets).toContain('$memory');

    // Unified memory tool node exists and can wire to agent.tools (template key stays 'memoryTool')
    const t = 'memoryTool';
    const entry = schema.find((s) => s.name === t);
    expect(entry?.kind).toBe('tool');
    const memToolPorts = schema.find((s) => s.name === t);
    expect(memToolPorts).toBeTruthy();
    expect(memToolPorts?.targetPorts).toEqual(expect.arrayContaining(['$self','$memory']));

    // memoryTool exposes node-level static config schema with name/description/title
    const memToolSchema = entry?.staticConfigSchema as any;
    expect(memToolSchema?.type).toBe('object');
    const propKeys = Object.keys(memToolSchema?.properties || {});
    expect(propKeys).toEqual(expect.arrayContaining(['name','description','title']));

    const agentTargets = agentSchema?.targetPorts || [];
    expect(agentTargets).toContain('memory');
  });
});
