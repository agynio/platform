import { describe, it, expect, vi } from 'vitest';
import { ShellTool } from '../../tools/shell_command';
import { LoggerService } from '../../services/logger.service';
import { ExecTimeoutError } from '../../utils/execTimeout';

// ANSI sequences should be stripped, but otherwise content preserved when <=10k
const ANSI_GREEN = '\u001b[32m';
const ANSI_RESET = '\u001b[0m';

describe('ShellTool timeout full inclusion when <=10k', () => {
  it('includes full stripped output when combined <= 10k chars', async () => {
    const logger = new LoggerService();
    const smallStdout = `${ANSI_GREEN}hello-from-stdout${ANSI_RESET}`;
    const smallStderr = `${ANSI_GREEN}and-stderr${ANSI_RESET}`;
    const combinedPlain = 'hello-from-stdoutand-stderr';
    const err = new ExecTimeoutError(3600000, smallStdout, smallStderr);

    const fakeContainer = {
      exec: vi.fn(async () => {
        throw err;
      }),
    } as any;

    const provider = { provide: vi.fn(async () => fakeContainer) } as any;
    const tool = new ShellTool(undefined as any, logger);
    tool.setContainerProvider(provider);
    await tool.configure({});
    const t = tool.init();

    try {
      await t.invoke({ command: 'sleep 1h' }, { configurable: { thread_id: 't' } } as any);
      throw new Error('expected to throw');
    } catch (e: any) {
      const msg = String(e?.message || e);
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
