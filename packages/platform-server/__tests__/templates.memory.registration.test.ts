import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import { ModuleRef } from '@nestjs/core';
import { LoggerService } from '../src/core/services/logger.service';
import { ContainerService } from '../src/infra/container/container.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { WorkspaceNode } from '../src/nodes/workspace/workspace.node';
import { ShellCommandNode } from '../src/nodes/tools/shell_command/shell_command.node';
import { MemoryNode } from '../src/nodes/memory/memory.node';
import { MemoryConnectorNode } from '../src/nodes/memoryConnector/memoryConnector.node';
import { EnvService } from '../src/env/env.service';
import { ArchiveService } from '../src/infra/archive/archive.service';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { PostgresMemoryEntitiesRepository } from '../src/nodes/memory/memory.repository';
import { MemoryService } from '../src/nodes/memory/memory.service';
import { PrismaClient } from '@prisma/client';

const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!process.env.AGENTS_DATABASE_URL;
const maybeIt = shouldRunDbTests ? it : it.skip;

// Build a registry and assert memory templates and agent memory port wiring are present.
describe('templates: memory registration and agent memory port', () => {
  maybeIt('registers memory and memoryConnector templates and exposes Agent memory target port', async () => {
    const logger = new LoggerService();
    const configService = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL || 'postgres://localhost/skip',
      }),
    );
    const containerService = new ContainerService(logger);
    const provisioner = { getLLM: async () => ({ call: async () => ({ text: 'ok', output: [] }) }) } as unknown as LLMProvisioner;
    const envService = new EnvService(configService);
    const archiveService = new ArchiveService();
    const ncpsKeyService = new NcpsKeyService(logger, configService);
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.AGENTS_DATABASE_URL || 'postgres://localhost/skip' } } });
    const memoryService = new MemoryService(
      new PostgresMemoryEntitiesRepository({ getClient: () => prisma } as any),
      { get: async () => null } as any,
    );

    class MinimalModuleRef implements Pick<ModuleRef, 'create' | 'get'> {
      create<T = any>(cls: new (...args: any[]) => T): T {
        // Provide minimal constructor args for known node classes
        if (cls === WorkspaceNode) return new WorkspaceNode(containerService, configService, ncpsKeyService, logger, envService) as unknown as T;
        if (cls === ShellCommandNode) return new ShellCommandNode(envService, logger, this as unknown as ModuleRef, archiveService) as unknown as T;
        if (cls === MemoryConnectorNode) return new MemoryConnectorNode(logger) as unknown as T;
        if (cls === MemoryNode) return new MemoryNode(this as unknown as ModuleRef, logger) as unknown as T;
        // Reducers/routers/tools not needed for schema introspection; construct without args
        return new (cls as any)();
      }
      get<TInput = any, TResult = TInput>(token: TInput): TResult {
        // Provide MemoryService for MemoryNode.getMemoryService
        if (token === MemoryService) return memoryService as unknown as TResult;
        // Return undefined for others (not used in schema tests)
        return undefined as unknown as TResult;
      }
    }

    const moduleRef = new MinimalModuleRef();

    const deps = {
      logger,
      containerService,
      configService,
      provisioner,
      moduleRef: moduleRef as unknown as ModuleRef,
    };

    const reg = buildTemplateRegistry(deps);
    const schema = await reg.toSchema();

    const memorySchema = schema.find((s) => s.name === 'memory');
    const memoryConnectorSchema = schema.find((s) => s.name === 'memoryConnector');
    const agentSchema = schema.find((s) => s.name === 'agent');
    expect(memorySchema).toBeTruthy();
    expect(memoryConnectorSchema).toBeTruthy();
    expect(agentSchema).toBeTruthy();

    // Memory and MemoryConnector are services
    expect(memorySchema?.kind).toBe('service');
    expect(memoryConnectorSchema?.kind).toBe('service');
    const workspaceMeta = schema.find((s) => s.name === 'workspace');
    expect(workspaceMeta?.kind).toBe('service');

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
    expect(memToolPorts?.targetPorts).toEqual(expect.arrayContaining(['$self', '$memory']));

    // palette no longer surfaces staticConfigSchema or capabilities
    expect((entry as any)?.staticConfigSchema).toBeUndefined();

    const agentTargets = agentSchema?.targetPorts || [];
    expect(agentTargets).toContain('memory');

    await prisma.$disconnect();
  });
});
