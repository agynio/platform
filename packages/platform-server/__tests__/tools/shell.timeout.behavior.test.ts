import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { ContainerService, ContainerHandle } from '@agyn/docker-runner';
import type { ExecOptions } from '@agyn/docker-runner';
import type { ContainerRegistry } from '../../src/infra/container/container.registry';
import { ExecIdleTimeoutError, ExecTimeoutError } from '../../src/utils/execTimeout';
import type { Mock } from 'vitest';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';

const makeRegistry = () => ({
  registerStart: vi.fn(async () => undefined),
  updateLastUsed: vi.fn(async () => undefined),
  markStopped: vi.fn(async () => undefined),
  markTerminating: vi.fn(async () => undefined),
  claimForTermination: vi.fn(async () => true),
  recordTerminationFailure: vi.fn(async () => undefined),
  findByVolume: vi.fn(async () => null),
  listByThread: vi.fn(async () => []),
  ensureIndexes: vi.fn(async () => undefined),
} satisfies Partial<ContainerRegistry>) as ContainerRegistry;

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

    const container = new RecordingContainer(new ContainerService(makeRegistry()), 'fake-container');
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

    const container = new RecordingContainer(new ContainerService(makeRegistry()), 'fake-container-stream');
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
        return new FakeContainer(new ContainerService(makeRegistry()), 'fake');
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
        return new FakeContainer(new ContainerService(makeRegistry()), 'fake');
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
        return new FakeContainer(new ContainerService(makeRegistry()), 'fake');
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

describe('ContainerService.execContainer killOnTimeout behavior', () => {
  let svc: ContainerService;
  beforeEach(() => {
    svc = new ContainerService(makeRegistry());
  });

  it('terminates exec process group on hard timeout without stopping container', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;

    // Patch service docker instance without any: use Reflect.set
    Reflect.set(svc as unknown as object, 'docker', docker);
    const terminateSpy = vi.fn(async () => undefined);
    Reflect.set(svc as unknown as object, 'terminateExecProcess', terminateSpy);
    const timeoutErr = new ExecTimeoutError(123, 'out', 'err');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw timeoutErr; }));

    await expect(
      svc.execContainer('cid123', 'echo hi', { timeoutMs: 123, killOnTimeout: true }),
    ).rejects.toThrow(/timed out/);
    expect(terminateSpy).toHaveBeenCalledTimes(1);
    const args = terminateSpy.mock.calls[0];
    expect(args[1]).toMatchObject({ containerId: 'cid123', reason: 'timeout', timeoutMs: 123 });
    const stoppedContainer = docker.getContainer.mock.results[0].value;
    expect(stoppedContainer.stop).not.toHaveBeenCalled();
  });

  it('terminates exec process group on idle timeout without stopping container', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const terminateSpy = vi.fn(async () => undefined);
    Reflect.set(svc as unknown as object, 'terminateExecProcess', terminateSpy);
    const idleTimeoutErr = new ExecIdleTimeoutError(456, 'partial-out', 'partial-err');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw idleTimeoutErr; }));

    await expect(
      svc.execContainer('cid999', 'echo nope', { timeoutMs: 456 }),
    ).rejects.toThrow(/timed out/);
    expect(terminateSpy).toHaveBeenCalledTimes(1);
    expect(terminateSpy.mock.calls[0][1]).toMatchObject({ containerId: 'cid999', reason: 'idle_timeout', idleTimeoutMs: 456 });
    const stoppedContainer = docker.getContainer.mock.results[0].value;
    expect(stoppedContainer.stop).not.toHaveBeenCalled();
  });

  it('propagates non-timeout errors unchanged (service)', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const terminateSpy = vi.fn(async () => undefined);
    Reflect.set(svc as unknown as object, 'terminateExecProcess', terminateSpy);
    const genericErr = new Error('Some other failure');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw genericErr; }));

    await expect(svc.execContainer('cid42', 'echo oops', { timeoutMs: 50, killOnTimeout: true })).rejects.toBe(
      genericErr,
    );
    // Should not attempt stop as it is not a timeout
    const anyStopped = docker.getContainer.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(anyStopped).toBe(false);
    expect(terminateSpy).not.toHaveBeenCalled();
  });

  it('terminates exec process group on idle timeout with killOnTimeout=true', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const terminateSpy = vi.fn(async () => undefined);
    Reflect.set(svc as unknown as object, 'terminateExecProcess', terminateSpy);
    const idleErr = new ExecIdleTimeoutError(321, 'a', 'b');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw idleErr; }));

    await expect(
      svc.execContainer('cidIdle', 'echo idle', { timeoutMs: 9999, idleTimeoutMs: 321, killOnTimeout: true }),
    ).rejects.toBe(idleErr);
    expect(terminateSpy).toHaveBeenCalledTimes(1);
    expect(terminateSpy.mock.calls[0][1]).toMatchObject({ containerId: 'cidIdle', reason: 'idle_timeout', idleTimeoutMs: 321 });
    const stopped = docker.getContainer.mock.results[0].value;
    expect(stopped.stop).not.toHaveBeenCalled();
  });
});

describe('ShellTool non-timeout error propagation', () => {
  it('returns plain-text message for non-timeout errors', async () => {
    class FakeContainer extends ContainerHandle {
      override async exec(): Promise<never> { throw new Error('Permission denied'); }
    }
    class FakeProvider {
      async provide(): Promise<ContainerHandle> {
        return new FakeContainer(new ContainerService(makeRegistry()), 'fake');
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
