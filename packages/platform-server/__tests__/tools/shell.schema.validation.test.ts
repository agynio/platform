import { describe, it, expect } from 'vitest';
import { ShellToolStaticConfigSchema } from '../../src/nodes/tools/shell_command/shell_command.node';
import { bashCommandSchema } from '../../src/nodes/tools/shell_command/shell_command.tool';

describe('ShellToolStaticConfigSchema validation', () => {
  it('accepts 0 for both timeouts', () => {
    const res = ShellToolStaticConfigSchema.safeParse({ executionTimeoutMs: 0, idleTimeoutMs: 0 });
    expect(res.success).toBe(true);
  });

  it('rejects invalid values for timeouts', () => {
    const invalids = [-1, 1, 999, 86400001];
    for (const v of invalids) {
      const execRes = ShellToolStaticConfigSchema.safeParse({ executionTimeoutMs: v });
      const idleRes = ShellToolStaticConfigSchema.safeParse({ idleTimeoutMs: v });
      expect(execRes.success).toBe(false);
      expect(idleRes.success).toBe(false);
    }
  });

  it('accepts optional cwd string', () => {
    expect(bashCommandSchema.safeParse({ command: 'pwd' }).success).toBe(true);
    expect(bashCommandSchema.safeParse({ command: 'pwd', cwd: '/workspace/app' }).success).toBe(true);
    expect(bashCommandSchema.safeParse({ command: 'pwd', cwd: 42 as unknown as string }).success).toBe(false);
  });
});
