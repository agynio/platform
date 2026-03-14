import { describe, expect, it } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { EnvService } from '../../src/env/env.service';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import type { ContainerHandle } from '../../src/infra/container/container.handle';

class RecordingContainer {
  public readonly calls: Array<{ command: string | string[]; workdir?: string }> = [];

  async exec(
    command: string | string[],
    options?: { workdir?: string; timeoutMs?: number; idleTimeoutMs?: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.calls.push({ command, workdir: options?.workdir });
    const wd = options?.workdir ?? '';
    return { stdout: `PWD=${wd}`, stderr: '', exitCode: 0 };
  }

  async putArchive(): Promise<void> {}
}

function createNodeWithContainer(container: RecordingContainer) {
  const resolver = {
    resolve: async (input: unknown) => ({
      output: input,
      report: { events: [], counts: { total: 0, resolved: 0, unresolved: 0, cacheHits: 0, errors: 0 } },
    }),
  };
  const envService = new EnvService(resolver as any);
  const moduleRefStub = {};
  const archiveStub = { createSingleFileTar: async () => Buffer.from('') } as const;
  const runEventsStub: Pick<RunEventsService, 'appendToolOutputChunk' | 'finalizeToolOutputTerminal'> = {
    appendToolOutputChunk: async (payload: unknown) => payload,
    finalizeToolOutputTerminal: async (payload: unknown) => payload,
  };
  const eventsBusStub: Pick<EventsBusService, 'emitToolOutputChunk' | 'emitToolOutputTerminal'> = {
    emitToolOutputChunk: () => undefined,
    emitToolOutputTerminal: () => undefined,
  };
  const prismaStub: Pick<PrismaService, 'getClient'> = {
    getClient: () => ({
      container: { findUnique: async () => null },
      containerEvent: { findFirst: async () => null },
    }),
  } as any;
  const node = new ShellCommandNode(
    envService as any,
    moduleRefStub as any,
    archiveStub as any,
    runEventsStub as any,
    eventsBusStub as any,
    prismaStub as any,
  );
  const provider = {
    provide: async () => container as unknown as ContainerHandle,
  };
  node.setContainerProvider(provider as any);
  return node;
}

const ctx = {
  threadId: 't1',
  finishSignal: { activate() {}, deactivate() {}, isActive: false },
  callerAgent: {},
} as const;

describe('ShellCommandTool cwd handling', () => {
  it('uses configured workdir when cwd is not provided', async () => {
    const container = new RecordingContainer();
    const node = createNodeWithContainer(container);
    await node.setConfig({ workdir: '/workspace/base' });
    const tool = node.getTool();

    const result = await tool.execute({ command: 'pwd' }, ctx as any);
    expect(result.trim()).toBe('PWD=/workspace/base');
    expect(container.calls).toHaveLength(1);
    expect(container.calls[0].workdir).toBe('/workspace/base');
  });

  it('overrides workdir with cwd when provided', async () => {
    const container = new RecordingContainer();
    const node = createNodeWithContainer(container);
    await node.setConfig({ workdir: '/workspace/base' });
    const tool = node.getTool();

    const result = await tool.execute({ command: 'pwd', cwd: '/workspace/app' }, ctx as any);
    expect(result.trim()).toBe('PWD=/workspace/app');
    expect(container.calls).toHaveLength(1);
    expect(container.calls[0].workdir).toBe('/workspace/app');
  });
});
