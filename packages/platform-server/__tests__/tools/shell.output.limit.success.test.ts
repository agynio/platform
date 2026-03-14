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

class FakeContainer implements ContainerHandle {
  public lastPut?: { data: Buffer; options: { path: string } };
  async exec(_cmd: string, _opts?: { env?: Record<string,string>, workdir?: string, timeoutMs?: number, idleTimeoutMs?: number, killOnTimeout?: boolean }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const out = 'A'.repeat(1200);
    return { stdout: out, stderr: '', exitCode: 0 };
  }
  async putArchive(data: Buffer, options: { path: string }): Promise<void> { this.lastPut = { data, options }; }
}
class FakeProvider { public c = new FakeContainer(); async provide(_t: string): Promise<ContainerHandle> { return this.c; } }

describe('ShellTool output limit - stdout oversized', () => {
  it('writes oversized output to /tmp and returns short error', async () => {
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

    const msg = await t.execute({ command: 'echo BIG' }, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false }, callerAgent: {} } as any);
    expect(msg).toMatch(/^Error: output length exceeds 1000 characters\. It was saved on disk: \/tmp\/.+\.txt$/);
    expect((provider.c as FakeContainer).lastPut?.options.path).toBe('/tmp');
    expect((provider.c as FakeContainer).lastPut?.data instanceof Buffer).toBe(true);
  });
});
