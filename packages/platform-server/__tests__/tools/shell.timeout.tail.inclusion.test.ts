import { describe, it, expect, vi } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { ExecTimeoutError } from '../../src/utils/execTimeout';
import { ContainerHandle } from '../../src/infra/container/container.handle';
import { ContainerService } from '../../src/infra/container/container.service';
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

// ANSI colored output to verify stripping; include more than 10k and ensure we only keep tail
const ANSI_RED = '\u001b[31m';
const ANSI_RESET = '\u001b[0m';

describe('ShellTool timeout tail inclusion and ANSI stripping', () => {
  it('includes stripped tail up to 10k chars from combined stdout+stderr', async () => {
    const longPrefix = 'x'.repeat(12000); // longer than 10k to force tail
    const stdout = `${ANSI_RED}${longPrefix}${ANSI_RESET}`; // will be stripped to plain
    const stderr = `${ANSI_RED}ERR-SECTION${ANSI_RESET}`;
    const err = new ExecTimeoutError(3600000, stdout, stderr);

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
    await expect(
      t.execute(payload as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any),
    ).rejects.toThrowError(/Error \(timeout after 3600000ms\): command exceeded 3600000ms and was terminated\. See output tail below\./);

    try {
      await t.execute(payload as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // No ANSI should remain
      expect(msg).not.toMatch(/\u001b\[/);
      // Tail should contain the last characters of the 12k string + ERR-SECTION
      const tailMatch = msg.match(/See output tail below\.\n----------\n([\s\S]+)$/);
      expect(tailMatch).not.toBeNull();
      const tail = tailMatch?.[1] ?? '';
      expect(tail.length).toBe(10_000);
      expect(tail.endsWith('ERR-SECTION')).toBe(true);
      expect(tail).toMatch(/^x+ERR-SECTION$/);
    }
  });
});
