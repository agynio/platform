import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import type { LoggerService } from '../src/services/logger.service';
import type { ContainerService } from '../src/services/container.service';
import type { ConfigService } from '../src/services/config.service';
import type { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';

// Build a registry and assert memory templates and agent memory port wiring are present.
describe('templates: memory registration and agent memory port', () => {
  it('registers memory and memoryConnector templates and exposes Agent memory target port', () => {
    const deps = {
      logger: {} as unknown as LoggerService,
      containerService: {} as unknown as ContainerService,
      configService: {} as unknown as ConfigService,
      slackService: {} as unknown as any,
      checkpointerService: {} as unknown as CheckpointerService,
      mongoService: { getDb: () => ({} as any) } as unknown as MongoService,
    };

    const reg = buildTemplateRegistry(deps);
    const ports = reg.getPortsMap();
    const schema = reg.toSchema();

    expect(Object.keys(ports)).toContain('memory');
    expect(Object.keys(ports)).toContain('memoryConnector');
    expect((ports as any).agent).toBeTruthy();
    // Schema contains static config for memory and memoryConnector
    const memSchema = schema.find((s) => s.name === 'memory');
    // Memory and MemoryConnector are services
    expect(memSchema?.kind).toBe('service');
    const memConnMeta = schema.find((s) => s.name === 'memoryConnector');
    expect(memConnMeta?.kind).toBe('service');
    const workspaceMeta = schema.find((s) => s.name === 'containerProvider');
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
    const memorySources = ports.memory.sourcePorts!;
    expect(memorySources.$self).toBeTruthy();
    expect((memorySources as any).getService).toBeUndefined();

    const memConnSources = ports.memoryConnector.sourcePorts!;
    expect(memConnSources.$self).toBeTruthy();

    const memConnTargets = ports.memoryConnector.targetPorts!;
    expect(memConnTargets.$memory).toBeTruthy();

    // Unified memory tool node exists and can wire to agent.tools (template key stays 'memoryTool')
    const t = 'memoryTool';
    const entry = schema.find((s) => s.name === t);
    expect(entry?.kind).toBe('tool');
    const p = (ports as any)[t];
    expect(p).toBeTruthy();
    expect(p.targetPorts.$memory).toBeTruthy();
    expect(p.targetPorts.$self).toBeTruthy();

    // memoryTool exposes node-level static config schema with name/description/title
    const memToolSchema = entry?.staticConfigSchema as any;
    expect(memToolSchema?.type).toBe('object');
    const propKeys = Object.keys(memToolSchema?.properties || {});
    expect(propKeys).toEqual(expect.arrayContaining(['name','description','title']));

    const agentTargets = (ports as any).agent.targetPorts!;
    expect(agentTargets.memory).toBeTruthy();
    // Method mapping to attach/detach memory connector
    expect((agentTargets.memory as any).kind).toBe('method');
    expect((agentTargets.memory as any).create).toBe('attachMemoryConnector');
    expect((agentTargets.memory as any).destroy).toBe('detachMemoryConnector');
  });
});
