import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import type { EnvService } from '../../src/env/env.service';
import type { ArchiveService } from '../../src/infra/archive/archive.service';
import type { ContainerHandle } from '../../src/infra/container/container.handle';

const STDOUT_PREFIX = 'A'.repeat(2000);
const STDERR_TAIL = 'B'.repeat(10_000);

class FakeContainer implements ContainerHandle {
  public lastPut?: { data: Buffer; options: { path: string } };
  async exec(_cmd: string, _opts?: { env?: Record<string,string>, workdir?: string, timeoutMs?: number, idleTimeoutMs?: number, killOnTimeout?: boolean }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return { stdout: STDOUT_PREFIX, stderr: STDERR_TAIL, exitCode: 123 };
  }
  async putArchive(data: Buffer, options: { path: string }): Promise<void> { this.lastPut = { data, options }; }
}
class FakeProvider { public c = new FakeContainer(); async provide(_t: string): Promise<ContainerHandle> { return this.c; } }

describe('ShellTool output limit - non-zero exit oversized', () => {
  it('overrides exit error formatting when oversized and writes file', async () => {
    const testingModule = await Test.createTestingModule({
      providers: [
        { provide: ModuleRef, useValue: { create: (Cls: any) => new Cls() } },
        { provide: 'EnvService', useValue: { resolveProviderEnv: async () => ({}) } as Pick<EnvService, 'resolveProviderEnv'> },
        { provide: 'ArchiveService', useValue: { createSingleFileTar: async (_f: string, _c: string, _m: number) => Buffer.from('tar') } as Pick<ArchiveService, 'createSingleFileTar'> },
        {
          provide: RunEventsService,
          useValue: {
            appendToolOutputChunk: async (payload: unknown) => payload,
            finalizeToolOutputTerminal: async (payload: unknown) => payload,
          },
        },
        {
          provide: EventsBusService,
          useValue: {
            emitToolOutputChunk: () => {},
            emitToolOutputTerminal: () => {},
          },
        },
        {
          provide: PrismaService,
          useValue: {
            getClient: () => ({
              container: { findUnique: async () => null },
              containerEvent: { findFirst: async () => null },
            }),
          },
        },
        {
          provide: ShellCommandNode,
          useFactory: (
            env: any,
            moduleRef: ModuleRef,
            archive: any,
            runEvents: RunEventsService,
            eventsBus: EventsBusService,
            prisma: PrismaService,
          ) => new ShellCommandNode(env as EnvService, moduleRef, archive as ArchiveService, runEvents, eventsBus, prisma),
          inject: ['EnvService', ModuleRef, 'ArchiveService', RunEventsService, EventsBusService, PrismaService],
        },
      ],
    }).compile();

    const node = await testingModule.resolve(ShellCommandNode);
    const provider = new FakeProvider();
    node.setContainerProvider(provider as any);
    await node.setConfig({ outputLimitChars: 1000 });
    const t = node.getTool();

    let error: Error | null = null;
    try {
      await t.execute(
        { command: 'fail' },
        { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false }, callerAgent: {} } as any,
      );
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message.split('\n')[0]).toBe('[exit code 123]');
    expect(message).toContain('Output exceeded 1000 characters.');
    expect(message).toMatch(/Full output saved to: \/tmp\/.+\.txt/);
    expect(message.toLowerCase()).toContain('output tail');
    const tailMatch = message.match(/--- output tail ---\n([\s\S]+)$/);
    expect(tailMatch).not.toBeNull();
    expect(tailMatch?.[1].length).toBe(10_000);
    expect(tailMatch?.[1]).toBe(STDERR_TAIL);
    expect((provider.c as FakeContainer).lastPut?.options.path).toBe('/tmp');
    expect((provider.c as FakeContainer).lastPut?.data instanceof Buffer).toBe(true);
  });
});
