import { describe, it, expect } from 'vitest';
import { CreateVariableBodySchema } from '../../src/variables/dto/createVariable.dto';
import { UpdateVariableBodySchema } from '../../src/variables/dto/updateVariable.dto';

describe('Variables DTO schemas', () => {
  it('accepts graph source with optional empty value', () => {
    const res = CreateVariableBodySchema.safeParse({ source: 'graph', key: 'Key 1', value: '' });
    expect(res.success).toBe(true);
  });
  it('accepts vault source with optional empty vaultRef', () => {
    const res = CreateVariableBodySchema.safeParse({ source: 'vault', key: 'Key 2', vaultRef: '' });
    expect(res.success).toBe(true);
  });
  it('accepts local source with optional value', () => {
    const res = CreateVariableBodySchema.safeParse({ source: 'local', key: 'Key 3', value: '' });
    expect(res.success).toBe(true);
  });
  it('rejects invalid key characters', () => {
    const res = CreateVariableBodySchema.safeParse({ source: 'graph', key: 'bad_key!' });
    expect(res.success).toBe(false);
  });
  it('update schemas accept optional fields', () => {
    const r1 = UpdateVariableBodySchema.safeParse({ source: 'graph', value: '' });
    const r2 = UpdateVariableBodySchema.safeParse({ source: 'vault', vaultRef: '' });
    const r3 = UpdateVariableBodySchema.safeParse({ source: 'local', value: '' });
    expect(r1.success && r2.success && r3.success).toBe(true);
  });
});

