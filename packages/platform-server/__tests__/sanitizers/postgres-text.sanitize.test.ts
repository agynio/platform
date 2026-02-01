import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  sanitizeJsonForPostgres,
  sanitizePrismaWriteInput,
  sanitizeStringForPostgres,
} from '../../src/common/sanitize/postgres-text.sanitize';

describe('sanitizeStringForPostgres', () => {
  it('replaces null bytes with replacement character', () => {
    const input = 'before\u0000after';

    expect(sanitizeStringForPostgres(input)).toBe('before\uFFFDafter');
  });

  it('keeps allowed whitespace and removes other control chars', () => {
    const input = 'line1\nline2\tline3\r\u0001';

    expect(sanitizeStringForPostgres(input)).toBe('line1\nline2\tline3\r\uFFFD');
  });

  it('returns original string when no control characters exist', () => {
    const input = 'clean string';

    expect(sanitizeStringForPostgres(input)).toBe(input);
  });
});

describe('sanitizeJsonForPostgres', () => {
  it('sanitizes nested arrays and objects', () => {
    const input = {
      title: 'ok',
      state: {
        last: 'broken\u0000value',
        nested: [{ text: 'more\u0002issues' }],
      },
      untouched: Prisma.JsonNull,
    };

    const sanitized = sanitizeJsonForPostgres(input);

    expect(sanitized).toEqual({
      title: 'ok',
      state: {
        last: 'broken\uFFFDvalue',
        nested: [{ text: 'more\uFFFDissues' }],
      },
      untouched: Prisma.JsonNull,
    });
    expect(sanitized).not.toBe(input);
  });

  it('returns identical reference when nothing is sanitized', () => {
    const input = { ok: 'value', arr: ['a', 'b'] };

    expect(sanitizeJsonForPostgres(input)).toBe(input);
  });
});

describe('sanitizePrismaWriteInput', () => {
  it('sanitizes arrays used in bulk operations', () => {
    const payload = [
      {
        data: {
          state: { summary: 'bad\u0000value' },
          label: 'clean',
        },
      },
    ];

    const sanitized = sanitizePrismaWriteInput(payload);

    expect(sanitized).toEqual([
      {
        data: {
          state: { summary: 'bad\uFFFDvalue' },
          label: 'clean',
        },
      },
    ]);
    expect(sanitized).not.toBe(payload);
  });

  it('sanitizes scalar fields on objects while preserving structure', () => {
    const payload = {
      data: {
        summary: 'prefix\u0000',
        metadata: { tags: ['alpha', 'broken\u0003'] },
      },
      where: { id: 'thread-1\u0005' },
    };

    const sanitized = sanitizePrismaWriteInput(payload);

    expect(sanitized).toEqual({
      data: {
        summary: 'prefix\uFFFD',
        metadata: { tags: ['alpha', 'broken\uFFFD'] },
      },
      where: { id: 'thread-1\uFFFD' },
    });
  });
});
