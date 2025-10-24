import { describe, it, expect, vi } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { LoggerService } from '../../src/core/services/logger.service';
import { ExecTimeoutError } from '../../src/utils/execTimeout';
// ContainerProviderEntity and ContainerHandle removed; use stub provider.

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

    const node = new ShellCommandNode(new (await import('../../src/graph/env.service')).EnvService(new LoggerService() as any));
    node.setContainerProvider(({
      provide: async (_t: string) => ({
        exec: async (): Promise<never> => { throw err; },
      } as any),
    } as any));
    await node.setConfig({});
    const t = node.getTool();

    const payload: any = { command: 'sleep 1h' };
    const ctx: any = { threadId: 't' };
    try {
      await t.execute(payload, ctx);
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
