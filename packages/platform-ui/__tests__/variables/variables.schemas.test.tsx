import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const variableViewItemSchema = z.object({
  key: z.string(),
  source: z.enum(['vault', 'graph', 'local']),
  value: z.string().optional(),
  vaultRef: z.string().optional(),
});
const variablesListSchema = z.array(variableViewItemSchema);

describe('Variables UI schemas', () => {
  it('parses empty value and vaultRef', () => {
    const res = variablesListSchema.safeParse([
      { key: 'A', source: 'graph', value: '' },
      { key: 'B', source: 'vault', vaultRef: '' },
      { key: 'C', source: 'local', value: '' },
    ]);
    expect(res.success).toBe(true);
  });
});

