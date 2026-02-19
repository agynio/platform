import { describe, it, expect, vi } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { ExecTimeoutError } from '../../src/utils/execTimeout';
import { ContainerHandle, ContainerService } from '@agyn/docker-runner';
import type { ContainerRegistry } from '../../src/infra/container/container.registry';

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
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';

// ANSI sequences should be stripped, but otherwise content preserved when <=10k
const ANSI_GREEN = '\u001b[32m';
const ANSI_RESET = '\u001b[0m';

describe('ShellTool timeout full inclusion when <=10k', () => {
  it('includes full stripped output when combined <= 10k chars', async () => {
    const smallStdout = `${ANSI_GREEN}hello-from-stdout${ANSI_RESET}`;
    const smallStderr = `${ANSI_GREEN}and-stderr${ANSI_RESET}`;
    const combinedPlain = 'hello-from-stdoutand-stderr';
    const err = new ExecTimeoutError(3600000, smallStdout, smallStderr);

    class FakeContainer extends ContainerHandle { override async exec(): Promise<never> { throw err; } }
    class FakeProvider {
      async provide(): Promise<ContainerHandle> {
        return new FakeContainer(new ContainerService(makeRegistry()), 'fake');
      }
    }
    const provider = new FakeProvider();
    const envServiceStub = { resolveProviderEnv: async () => ({}) };
    const moduleRefStub = {};
    const archiveStub = { createSingleFileTar: async () => Buffer.from('tar') } as const;
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
      envServiceStub as any,
      moduleRefStub as any,
      archiveStub as any,
      runEventsStub as any,
      eventsBusStub as any,
      prismaStub as any,
    );
    node.setContainerProvider(provider as any);
    await node.setConfig({});
    const t = node.getTool();

    const payload = { command: 'sleep 1h' } as any;
    const message = await t.execute(payload as any, {
      threadId: 't',
      finishSignal: { activate() {}, deactivate() {}, isActive: false } as any,
      callerAgent: {} as any,
    } as any);

    expect(message.startsWith('[exit code 408] Exec timed out after 3600000ms')).toBe(true);
    const lines = message.split('\n');
    expect(lines[1]).toBe('---');
    const tail = lines.slice(2).join('\n');
    expect(tail).not.toMatch(/\u001b\[/);
    expect(tail).toContain(combinedPlain);
  });
});
