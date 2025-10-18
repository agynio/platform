import { describe, it, expect, vi } from 'vitest';
import { ShellTool } from '../../tools/shell_command';
import { LoggerService } from '../../services/logger.service';
import { ExecTimeoutError } from '../../utils/execTimeout';
import { ContainerEntity } from '../../entities/container.entity';
import { ContainerProviderEntity } from '../../entities/containerProvider.entity';
import { ContainerService } from '../../services/container.service';

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

    class FakeContainer extends ContainerEntity { override async exec(): Promise<never> { throw err; } }
    class FakeProvider extends ContainerProviderEntity {
      constructor(logger: LoggerService) { super(new ContainerService(logger), undefined, {}, () => ({})); }
      override async provide(): Promise<ContainerEntity> { return new FakeContainer(new ContainerService(logger), 'fake'); }
    }
    const provider = new FakeProvider(logger);
    const tool = new ShellTool(undefined, logger);
    tool.setContainerProvider(provider);
    await tool.setConfig({});
    const t = tool.init();

    type InvokeArgs = Parameters<ReturnType<ShellTool['init']>['invoke']>;
    const payload: InvokeArgs[0] = { command: 'sleep 1h' };
    const ctx: InvokeArgs[1] = { configurable: { thread_id: 't' } } as any;
    await expect(
      t.invoke(payload, ctx),
    ).rejects.toThrowError(/Error \(timeout after 3600000ms\): command exceeded 3600000ms and was terminated\. See output tail below\./);

    try {
      await t.invoke(payload, ctx);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
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
