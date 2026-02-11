import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import { ModuleRef } from '@nestjs/core';
import { ContainerService } from '../src/infra/container/container.service';
import type { ContainerRegistry } from '../src/infra/container/container.registry';
import { ConfigService, configSchema } from '../src/core/services/config.service';
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
    const configService = new ConfigService().init(
      configSchema.parse({
        agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL || 'postgres://localhost/skip',
        litellmBaseUrl: 'http://localhost:4000',
        litellmMasterKey: 'sk-test',
      }),
    );
    const containerService = new ContainerService(undefined as unknown as ContainerRegistry);
    const resolver = {
      resolve: async (input: unknown) => ({
        output: input,
        report: { events: [], counts: { total: 0, resolved: 0, unresolved: 0, cacheHits: 0, errors: 0 } },
      }),
    };
    const envService = new EnvService(resolver as any);
    const archiveService = new ArchiveService();
    const ncpsKeyService = new NcpsKeyService(configService);
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.AGENTS_DATABASE_URL || 'postgres://localhost/skip' } } });
    const memoryService = new MemoryService(
      new PostgresMemoryEntitiesRepository({ getClient: () => prisma } as any),
      { get: async () => null } as any,
    );

    class MinimalModuleRef implements Pick<ModuleRef, 'create' | 'get'> {
      create<T = any>(cls: new (...args: any[]) => T): T {
        // Provide minimal constructor args for known node classes
        if (cls === WorkspaceNode)
          return new WorkspaceNode(containerService, configService, ncpsKeyService, envService) as unknown as T;
        if (cls === ShellCommandNode)
          return new ShellCommandNode(
            envService as any,
            this as unknown as ModuleRef,
            archiveService as any,
            {
              appendToolOutputChunk: async (payload: unknown) => payload,
              finalizeToolOutputTerminal: async (payload: unknown) => payload,
            } as any,
            {
              emitToolOutputChunk: () => {},
              emitToolOutputTerminal: () => {},
            } as any,
            {
              getClient: () => ({
                container: { findUnique: async () => null },
                containerEvent: { findFirst: async () => null },
              }),
            } as any,
          ) as unknown as T;
        if (cls === MemoryConnectorNode) return new MemoryConnectorNode() as unknown as T;
        if (cls === MemoryNode) return new MemoryNode(this as unknown as ModuleRef) as unknown as T;
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
