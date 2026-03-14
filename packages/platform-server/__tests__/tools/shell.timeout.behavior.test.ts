import { describe, it, expect } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { ContainerHandle } from '../../src/infra/container/container.handle';
import type { ExecOptions } from '../../src/infra/container/dockerRunner.types';
import { ExecIdleTimeoutError } from '../../src/utils/execTimeout';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import { createDockerClientPortStub } from '../helpers/dockerClient.stub';

const createShellNode = () => {
  const envServiceStub = { resolveProviderEnv: async () => ({}) };
  const moduleRefStub = {};
  const archiveStub = { createSingleFileTar: async () => Buffer.from('tar') };
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
  return new ShellCommandNode(
    envServiceStub as any,
    moduleRefStub as any,
    archiveStub as any,
    runEventsStub as any,
    eventsBusStub as any,
    prismaStub as any,
  );
};

describe('ShellTool killOnTimeout configuration', () => {
  const baseCtx = {
    threadId: 'thread-123',
    finishSignal: { activate() {}, deactivate() {}, isActive: false },
    callerAgent: {},
  } as const;

  it('disables killOnTimeout for buffered exec', async () => {
    class RecordingContainer extends ContainerHandle {
      lastExecOptions?: ExecOptions;
      override async exec(_cmd: string | string[], options?: ExecOptions) {
        this.lastExecOptions = options;
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    }

    const container = new RecordingContainer(createDockerClientPortStub(), 'fake-container');
    const provider = { provide: async () => container };
    const node = createShellNode();
    node.setContainerProvider(provider as any);
    await node.setConfig({});

    const tool = node.getTool();
    const result = await tool.execute({ command: 'echo buffered' } as any, baseCtx as any);

    expect(typeof result).toBe('string');
    expect(container.lastExecOptions?.killOnTimeout).toBe(false);
  });

  it('disables killOnTimeout for streaming exec', async () => {
    class RecordingContainer extends ContainerHandle {
      lastExecOptions?: ExecOptions;
      override async exec(_cmd: string | string[], options?: ExecOptions) {
        this.lastExecOptions = options;
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    }

    const container = new RecordingContainer(createDockerClientPortStub(), 'fake-container-stream');
    const provider = { provide: async () => container };
    const node = createShellNode();
    node.setContainerProvider(provider as any);
    await node.setConfig({});

    const tool = node.getTool();
    const message = await tool.executeStreaming(
      { command: 'echo streaming' } as any,
      baseCtx as any,
      { runId: 'run-1', threadId: 'thread-123', eventId: 'event-1' },
    );

    expect(typeof message).toBe('string');
    expect(container.lastExecOptions?.killOnTimeout).toBe(false);
  });
});

describe('ShellTool timeout error message', () => {
  it('returns clear timeout message with tail header on exec timeout', async () => {
    const timeoutErr = new Error('Exec timed out after 3600000ms');

    class FakeContainer extends ContainerHandle { override async exec(_cmd: string | string[], _opts?: unknown): Promise<never> { throw timeoutErr; } }
    class FakeProvider {
      async provide(_t: string): Promise<ContainerHandle> {
        return new FakeContainer(createDockerClientPortStub(), 'fake');
      }
    }
    const provider = new FakeProvider();

    const node = createShellNode();
    node.setContainerProvider(provider as any);
    await node.setConfig({});
    const t = node.getTool();

    const payload = { command: 'sleep 999999' } as any;
    const result = await t.execute(payload as any, {
      threadId: 't',
      finishSignal: { activate() {}, deactivate() {}, isActive: false } as any,
      callerAgent: {} as any,
    } as any);
    expect(result).toBe('[exit code 408] Exec timed out after 3600000ms\n---\n');
  });

  it('distinguishes idle timeout messaging', async () => {
    const idleErr = new ExecIdleTimeoutError(60000, 'out', 'err');
    class FakeContainer extends ContainerHandle { override async exec(): Promise<never> { throw idleErr; } }
    class FakeProvider {
      async provide(): Promise<ContainerHandle> {
        return new FakeContainer(createDockerClientPortStub(), 'fake');
      }
    }
    const provider = new FakeProvider();
    const node = createShellNode();
    node.setContainerProvider(provider as any);
    await node.setConfig({});
    const t = node.getTool();
    const payload = { command: 'sleep 999999' } as any;
    const result = await t.execute(payload as any, {
      threadId: 't',
      finishSignal: { activate() {}, deactivate() {}, isActive: false } as any,
      callerAgent: {} as any,
    } as any);
    expect(result).toBe('[exit code 408] Exec idle timed out after 60000ms\n---\nouterr');
  });

  it('reports actual enforced idle timeout from error.timeoutMs when available', async () => {
    const idleErr = new (class extends ExecIdleTimeoutError { constructor() { super(12345, 'out', 'err'); } })();
    class FakeContainer extends ContainerHandle { override async exec(): Promise<never> { throw idleErr; } }
    class FakeProvider {
      async provide(): Promise<ContainerHandle> {
        return new FakeContainer(createDockerClientPortStub(), 'fake');
      }
    }
    const provider = new FakeProvider();
    const node = createShellNode();
    node.setContainerProvider(provider as any);
    await node.setConfig({ idleTimeoutMs: 60000 });
    const t = node.getTool();
    const payload = { command: 'sleep 999999' } as any;
    const result = await t.execute(payload as any, {
      threadId: 't',
      finishSignal: { activate() {}, deactivate() {}, isActive: false } as any,
      callerAgent: {} as any,
    } as any);
    expect(result).toContain('Exec idle timed out after 12345ms');
  });
});

describe('ShellTool non-timeout error propagation', () => {
  it('returns plain-text message for non-timeout errors', async () => {
    class FakeContainer extends ContainerHandle {
      override async exec(): Promise<never> { throw new Error('Permission denied'); }
    }
    class FakeProvider {
      async provide(): Promise<ContainerHandle> {
        return new FakeContainer(createDockerClientPortStub(), 'fake');
      }
    }
    const provider = new FakeProvider();

    const node = createShellNode();
    node.setContainerProvider(provider as any);
    await node.setConfig({});
    const t = node.getTool();

    const payload = { command: 'ls' } as any;
    const result = await t.execute(payload as any, {
      threadId: 't',
      finishSignal: { activate() {}, deactivate() {}, isActive: false } as any,
      callerAgent: {} as any,
    } as any);
    expect(result).toBe('[exit code 500] Permission denied\n---\n');
  });
});
