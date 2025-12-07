import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { sanitizeJsonStrings } from '../src/llm/services/messages.serialization';

describe('sanitizeJsonStrings', () => {
  it('replaces null bytes recursively without mutating input', () => {
    const value = {
      ok: 'value',
      nested: [
        {
          text: 'bad\u0000value',
          arr: ['\u0000', 'clean'],
          deeper: { field: 'safe\u0000' },
        },
      ],
      nullable: null,
    } as const;

    const sanitized = sanitizeJsonStrings(value as unknown as Prisma.InputJsonValue);

    const cast = sanitized as typeof value;
    expect(cast).not.toBe(value);
    expect(cast.nested).not.toBe(value.nested);
    expect(cast.nested[0]?.text).toBe('bad\uFFFDvalue');
    expect(cast.nested[0]?.arr[0]).toBe('\uFFFD');
    expect(cast.nested[0]?.arr[1]).toBe('clean');
    expect(cast.nested[0]?.deeper.field).toBe('safe\uFFFD');
    expect(cast.nullable).toBeNull();

    expect(value.nested[0]?.text).toBe('bad\u0000value');
    expect(value.nested[0]?.arr[0]).toBe('\u0000');
    expect(value.nested[0]?.deeper.field).toBe('safe\u0000');
  });

  it('returns the original reference when no strings require changes', () => {
    const value = { clean: 'value', count: 3 } as const;
    const sanitized = sanitizeJsonStrings(value as unknown as Prisma.InputJsonValue);
    expect(sanitized).toBe(value);
  });

  it('leaves Prisma JSON null sentinels untouched', () => {
    expect(sanitizeJsonStrings(Prisma.JsonNull)).toBe(Prisma.JsonNull);
    expect(sanitizeJsonStrings(Prisma.DbNull)).toBe(Prisma.DbNull);
    expect(sanitizeJsonStrings(Prisma.AnyNull)).toBe(Prisma.AnyNull);
  });
});
