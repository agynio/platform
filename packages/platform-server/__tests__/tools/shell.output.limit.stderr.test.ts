import { describe, it, expect } from 'vitest';
import { ShellCommandNode } from '../../src/graph/nodes/tools/shell_command/shell_command.node';
import { LoggerService } from '../../src/core/services/logger.service';

class FakeContainer {
  public lastPut?: { data: Buffer; options: { path: string } };
  async exec(_cmd: string, _opts?: unknown): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const out = 'O'.repeat(600);
    const err = 'E'.repeat(600);
    return { stdout: out, stderr: err, exitCode: 0 };
  }
  async putArchive(data: Buffer, options: { path: string }): Promise<void> { this.lastPut = { data, options }; }
}
class FakeProvider { public c = new FakeContainer(); async provide(): Promise<FakeContainer> { return this.c; } }

describe('ShellTool output limit - combined stdout+stderr oversized', () => {
  it('writes combined oversized output to /tmp and returns short error', async () => {
    const logger = new LoggerService();
    const provider = new FakeProvider();
    const archiveStub = { createSingleFileTar: async () => Buffer.from('tar') } as const;
    const moduleRefStub = { create: (cls: any) => new (cls as any)(archiveStub) } as const;
    const node = new ShellCommandNode(undefined as any, logger as any, moduleRefStub as any);
    node.setContainerProvider(provider as any);
    await node.setConfig({ outputLimitChars: 1000 });
    const t = node.getTool();

    const msg = await t.execute({ command: 'run' } as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any);
    expect(msg).toMatch(/^Error: output length exceeds 1000 characters\. It was saved on disk: \/tmp\/.+\.txt$/);
    expect(provider.c.lastPut?.options.path).toBe('/tmp');
    expect(provider.c.lastPut?.data instanceof Buffer).toBe(true);
  });
});
