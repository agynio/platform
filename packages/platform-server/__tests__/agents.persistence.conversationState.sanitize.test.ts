import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  sanitizeJsonValueStringsForPostgres,
  sanitizeStringForPostgresText,
} from '../src/llm/repositories/conversationState.sanitize';

describe('sanitizeStringForPostgresText', () => {
  it('replaces null bytes with the replacement character', () => {
    expect(sanitizeStringForPostgresText('before\u0000after')).toBe('before\uFFFDafter');
  });

  it('preserves allowed whitespace characters', () => {
    const input = 'line1\nline2\tline3\r';

    expect(sanitizeStringForPostgresText(input)).toBe(input);
  });

  it('returns the original string when no control characters exist', () => {
    const input = 'clean string';

    expect(sanitizeStringForPostgresText(input)).toBe(input);
  });
});

describe('sanitizeJsonValueStringsForPostgres', () => {
  it('sanitizes nested strings within objects and arrays', () => {
    const malformed = {
      summary: 'bad\u0000value',
      nested: [{ text: 'chunk\u0002data' }],
      untouched: Prisma.JsonNull,
    };

    const sanitized = sanitizeJsonValueStringsForPostgres(malformed);

    expect(sanitized).toEqual({
      summary: 'bad\uFFFDvalue',
      nested: [{ text: 'chunk\uFFFDdata' }],
      untouched: Prisma.JsonNull,
    });
  });

  it('returns the same reference when the payload is already clean', () => {
    const clean = { summary: 'ok', data: ['one', 'two'] };

    expect(sanitizeJsonValueStringsForPostgres(clean)).toBe(clean);
  });
});
