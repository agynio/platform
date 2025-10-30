import { describe, it, expect } from 'vitest';
import { ShellToolStaticConfigSchema } from '../../src/graph/nodes/tools/shell_command/shell_command.node';

describe('ShellToolStaticConfigSchema outputLimitChars', () => {
  it('accepts 0 (disabled)', () => {
    const res = ShellToolStaticConfigSchema.safeParse({ outputLimitChars: 0 });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.outputLimitChars).toBe(0);
  });

  it('accepts large positive integers', () => {
    const big = 10_000_000; // no upper bound enforced
    const res = ShellToolStaticConfigSchema.safeParse({ outputLimitChars: big });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.outputLimitChars).toBe(big);
  });

  it('rejects negatives and non-integers', () => {
    const cases: any[] = [-1, -100, 3.14, 1.5];
    for (const v of cases) {
      const parsed = ShellToolStaticConfigSchema.safeParse({ outputLimitChars: v });
      expect(parsed.success).toBe(false);
    }
  });
});

