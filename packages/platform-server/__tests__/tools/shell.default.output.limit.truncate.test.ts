import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { RunEventsService } from '../../src/events/run-events.service';
import { EventsBusService } from '../../src/events/events-bus.service';
import { PrismaService } from '../../src/core/services/prisma.service';
import type { EnvService } from '../../src/env/env.service';
import type { ArchiveService } from '../../src/infra/archive/archive.service';
import type { ContainerHandle } from '../../src/infra/container/container.handle';

const OVERSIZED_OUTPUT = 'A'.repeat(60_000);

class FakeContainer implements ContainerHandle {
  public lastPut?: { data: Buffer; options: { path: string } };

  async exec(
    _cmd: string,
    _opts?: {
      env?: Record<string, string>;
      workdir?: string;
      timeoutMs?: number;
      idleTimeoutMs?: number;
      killOnTimeout?: boolean;
      logToPid1?: boolean;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return { stdout: OVERSIZED_OUTPUT, stderr: '', exitCode: 0 };
  }

  async putArchive(data: Buffer, options: { path: string }): Promise<void> {
    this.lastPut = { data, options };
  }
}

class FakeProvider {
  public c = new FakeContainer();
  async provide(_t: string): Promise<ContainerHandle> {
    return this.c;
  }
}

describe('ShellTool default output limit', () => {
  it('applies schema default to truncate oversized output without triggering reducer overflow', async () => {
    const savedTar: { filename?: string; content?: string; mode?: number } = {};
    const archiveStub = {
      createSingleFileTar: vi.fn(async (filename: string, content: string, mode: number) => {
        savedTar.filename = filename;
        savedTar.content = content;
        savedTar.mode = mode;
        return Buffer.from('tar');
      }),
    } satisfies Pick<ArchiveService, 'createSingleFileTar'>;

    const testingModule = await Test.createTestingModule({
      providers: [
        { provide: ModuleRef, useValue: { create: (Cls: any) => new Cls() } },
        {
          provide: 'EnvService',
          useValue: { resolveProviderEnv: async () => ({}) } as Pick<EnvService, 'resolveProviderEnv'>,
        },
        { provide: 'ArchiveService', useValue: archiveStub },
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
    const tool = node.getTool();

    const message = await tool.execute(
      { command: 'echo huge' },
      {
        threadId: 'thread-1',
        finishSignal: { activate() {}, deactivate() {}, isActive: false },
        callerAgent: {},
      } as any,
    );

    expect(message).toMatch(
      /^Error: output length exceeds 50000 characters\. It was saved on disk: \/tmp\/[0-9a-f-]{36}\.txt$/i,
    );
    expect(message.length).toBeLessThan(50000);

    const savedPath = message.split(': ').at(-1) ?? '';
    expect(savedPath.startsWith('/tmp/')).toBe(true);

    expect(provider.c.lastPut?.options.path).toBe('/tmp');
    expect(provider.c.lastPut?.data instanceof Buffer).toBe(true);

    expect(archiveStub.createSingleFileTar).toHaveBeenCalledTimes(1);
    expect(savedTar.filename).toBe(`${savedPath.slice('/tmp/'.length)}`);
    expect(savedTar.mode).toBe(0o644);
    expect(savedTar.content).toBe(OVERSIZED_OUTPUT);
  });
});
