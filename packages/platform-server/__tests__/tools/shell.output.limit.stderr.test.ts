import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { LoggerService } from '../../src/core/services/logger.service';
import type { EnvService } from '../../src/env/env.service';
import type { ArchiveService } from '../../src/infra/archive/archive.service';
import type { ContainerHandle } from '../../src/infra/container/container.handle';

class FakeContainer implements ContainerHandle {
  public lastPut?: { data: Buffer; options: { path: string } };
  async exec(_cmd: string, _opts?: { env?: Record<string,string>, workdir?: string, timeoutMs?: number, idleTimeoutMs?: number, killOnTimeout?: boolean }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const out = 'O'.repeat(600);
    const err = 'E'.repeat(600);
    return { stdout: out, stderr: err, exitCode: 0 };
  }
  async putArchive(data: Buffer, options: { path: string }): Promise<void> { this.lastPut = { data, options }; }
}
class FakeProvider { public c = new FakeContainer(); async provide(_t: string): Promise<ContainerHandle> { return this.c; } }

describe('ShellTool output limit - combined stdout+stderr oversized', () => {
  it('writes combined oversized output to /tmp and returns short error', async () => {
    const testingModule = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ModuleRef, useValue: { create: (Cls: any) => new Cls() } },
        { provide: 'EnvService', useValue: { resolveProviderEnv: async () => ({}) } as Pick<EnvService,'resolveProviderEnv'> },
        { provide: 'ArchiveService', useValue: { createSingleFileTar: async (_f: string, _c: string, _m: number) => Buffer.from('tar') } as Pick<ArchiveService,'createSingleFileTar'> },
        { provide: ShellCommandNode, useFactory: (env: any, logger: LoggerService, moduleRef: ModuleRef, archive: any) => new ShellCommandNode(env as EnvService, logger, moduleRef, archive as ArchiveService), inject: ['EnvService', LoggerService, ModuleRef, 'ArchiveService'] },
      ],
    }).compile();

    const node = await testingModule.resolve(ShellCommandNode);
    const provider = new FakeProvider();
    node.setContainerProvider(provider as any);
    await node.setConfig({ outputLimitChars: 1000 });
    const t = node.getTool();

    const msg = await t.execute(
      { command: 'run' },
      { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false }, terminateSignal: { activate() {}, deactivate() {}, isActive: false }, callerAgent: {} } as any,
    );
    expect(msg).toMatch(/^Error: output length exceeds 1000 characters\. It was saved on disk: \/tmp\/.+\.txt$/);
    expect((provider.c as FakeContainer).lastPut?.options.path).toBe('/tmp');
    expect((provider.c as FakeContainer).lastPut?.data instanceof Buffer).toBe(true);
  });
});
