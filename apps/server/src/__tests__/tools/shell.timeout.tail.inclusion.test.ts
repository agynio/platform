import { describe, it, expect, vi } from 'vitest';
import { ShellTool } from '../../tools/shell_command';
import { LoggerService } from '../../services/logger.service';
import { ExecTimeoutError } from '../../utils/execTimeout';

// ANSI colored output to verify stripping; include more than 10k and ensure we only keep tail
const ANSI_RED = '\u001b[31m';
const ANSI_RESET = '\u001b[0m';

describe('ShellTool timeout tail inclusion and ANSI stripping', () => {
  it('includes stripped tail up to 10k chars from combined stdout+stderr', async () => {
    const logger = new LoggerService();
    const longPrefix = 'x'.repeat(12000); // longer than 10k to force tail
    const stdout = `${ANSI_RED}${longPrefix}${ANSI_RESET}`; // will be stripped to plain
    const stderr = `${ANSI_RED}ERR-SECTION${ANSI_RESET}`;
    const err = new ExecTimeoutError(3600000, stdout, stderr);

    const fakeContainer = {
      exec: vi.fn(async () => {
        throw err;
      }),
    } as any;

    const provider = { provide: vi.fn(async () => fakeContainer) } as any;
    const tool = new ShellTool(undefined as any, logger);
    tool.setContainerProvider(provider);
    await tool.setConfig({});
    const t = tool.init();

    await expect(
      t.invoke({ command: 'sleep 1h' }, { configurable: { thread_id: 't' } } as any),
    ).rejects.toThrowError(/Error \(timeout after 3600000ms\): command exceeded 3600000ms and was terminated\. See output tail below\./);

    try {
      await t.invoke({ command: 'sleep 1h' }, { configurable: { thread_id: 't' } } as any);
    } catch (e: any) {
      const msg = String(e?.message || e);
      // No ANSI should remain
      expect(msg).not.toMatch(/\u001b\[/);
      // Tail should contain the last characters of the 12k string + ERR-SECTION
      expect(msg).toContain('ERR-SECTION');
      const tailIndex = msg.indexOf('----------');
      expect(tailIndex).toBeGreaterThan(0);
      const tail = msg.substring(tailIndex + '----------'.length);
      expect(tail.length).toBeLessThanOrEqual(10010); // tail plus possible newline
    }
  });
});
