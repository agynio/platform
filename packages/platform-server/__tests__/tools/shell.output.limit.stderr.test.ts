import { describe, it, expect } from 'vitest';
import { ShellCommandNode } from '../../src/graph/nodes/tools/shell_command/shell_command.node';
import { LoggerService } from '../../src/core/services/logger.service';
import { promises as fs } from 'node:fs';

class FakeContainer {
  async exec(_cmd: string, _opts?: unknown): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const out = 'O'.repeat(600);
    const err = 'E'.repeat(600);
    return { stdout: out, stderr: err, exitCode: 0 };
  }
}
class FakeProvider { async provide(): Promise<FakeContainer> { return new FakeContainer(); } }

describe('ShellTool output limit - combined stdout+stderr oversized', () => {
  it('writes combined oversized output to /tmp and returns short error', async () => {
    const logger = new LoggerService();
    const node = new ShellCommandNode(undefined as any);
    node.setContainerProvider(new FakeProvider() as any);
    await node.setConfig({ outputLimitChars: 1000 });
    const t = node.getTool();

    const msg = await t.execute({ command: 'run' } as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any);
    expect(msg).toMatch(/^Error: output length exceeds 1000 characters\. It was saved on disk: \/tmp\/.+\.txt$/);
    const path = msg.replace(/^Error: output length exceeds 1000 characters\. It was saved on disk: /, '');
    const content = await fs.readFile(path, 'utf8');
    expect(content.length).toBe(1200);
    const stat = await fs.stat(path);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
