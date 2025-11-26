import { describe, it, expect, vi } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { ExecTimeoutError } from '../../src/utils/execTimeout';
import { ContainerHandle } from '../../src/infra/container/container.handle';
import { ContainerService } from '../../src/infra/container/container.service';
import { LoggerService } from '../../src/core/services/logger.service';
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
        return new FakeContainer(new ContainerService(makeRegistry(), new LoggerService()), 'fake');
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
    try {
      await t.execute(payload as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any);
      throw new Error('expected to throw');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const sepIndex = msg.indexOf('----------');
      expect(sepIndex).toBeGreaterThan(0);
      const tail = msg.slice(sepIndex + '----------'.length + 1); // skip separator and newline
      // no ansi
      expect(tail).not.toMatch(/\u001b\[/);
      // full plain text content should be present (not truncated)
      expect(tail).toContain(combinedPlain);
    }
  });
});
