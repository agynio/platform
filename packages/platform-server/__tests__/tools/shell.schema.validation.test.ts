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

  it('validates cwd input schema', () => {
    const ok = bashCommandSchema.safeParse({ command: 'pwd', cwd: 'project/src' });
    expect(ok.success).toBe(true);
    const invalid = bashCommandSchema.safeParse({ command: 'pwd', cwd: 'foo$bar' });
    expect(invalid.success).toBe(false);
  });
});
