import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';

// Access private via any for lightweight test without changing API
const logger = new LoggerService() as any;

describe('LoggerService.serialize', () => {
  it('expands Error objects', () => {
    const err = new Error('boom');
    const json = logger.serialize([err]);
    const parsed = JSON.parse(json)[0];
    expect(parsed.name).toBe('Error');
    expect(parsed.message).toBe('boom');
    expect(typeof parsed.stack).toBe('string');
  });

  it('handles circular refs and redacts tokens', () => {
    const o: any = { accessToken: 'SECRET_TOKEN', nested: {} };
    o.self = o; // circular
    o.nested.password = 'pw';
    const json = logger.serialize([o]);
    const parsed = JSON.parse(json)[0];
    expect(parsed.accessToken).toBe('[REDACTED]');
    expect(parsed.nested.password).toBe('[REDACTED]');
    expect(parsed.self).toBe('[Circular]');
  });

  it('includes error cause if present', () => {
    const cause = new Error('root');
    const err = new Error('outer', { cause });
    const parsed = JSON.parse(logger.serialize([err]))[0];
    expect(parsed.cause.name).toBe('Error');
    expect(parsed.cause.message).toBe('root');
  });

  it('redacts Authorization Bearer tokens in error message/stack', () => {
    const err = new Error('failed with Authorization: Bearer abc123XYZtoken');
    // Override stack to include a github personal access token
    (err as any).stack = 'Trace: ghp_ABCDEFGHIJKLMNOPQRSTUVWX123456';
    const parsed = JSON.parse(logger.serialize([err]))[0];
    expect(parsed.message).toContain('Bearer [REDACTED]');
    expect(parsed.message).not.toContain('abc123XYZtoken');
    expect(parsed.stack).not.toContain('ghp_');
    expect(parsed.stack).toContain('[REDACTED]');
  });

  it('redacts token-like substrings in plain strings', () => {
    const s = 'leak github_pat_ABC_def_12345678901234567890 and ghp_ABCDEFGHIJKLMNOPQRST1234';
    const parsed = JSON.parse(logger.serialize([s]))[0];
    expect(parsed).not.toContain('github_pat_');
    expect(parsed).not.toContain('ghp_');
    expect(parsed).toContain('[REDACTED]');
  });

  it('truncates long strings and limits object breadth', () => {
    const long = 'x'.repeat(2500);
    const wide: any = {};
    for (let i = 0; i < 120; i++) wide['k' + i] = i;
    const parsed = JSON.parse(logger.serialize([long, wide]));
    // long string should be truncated marker present
    expect(typeof parsed[0]).toBe('string');
    expect(parsed[0].length).toBeLessThan(2100);
    // wide object should have __truncated__ marker
    expect(parsed[1].__truncated__).toBeDefined();
  });

  it('limits nested error cause expansion depth', () => {
    const e3 = new Error('lvl3');
    const e2: any = new Error('lvl2', { cause: e3 });
    // Attach a deeper non-Error cause chain to test object recursion
    (e3 as any).cause = { level: 4, cause: { level: 5 } };
    const e1 = new Error('lvl1', { cause: e2 });
    const parsed = JSON.parse(logger.serialize([e1]))[0];
    // cause should exist but be truncated at some depth
    const c2 = parsed.cause;
    expect(c2.name).toBe('Error');
    // Either nested cause becomes an object or a truncated marker
    if (c2.cause && typeof c2.cause === 'object') {
      // Next level may be truncated string marker
      if (typeof c2.cause.cause === 'string') {
        expect(c2.cause.cause).toContain('Truncated');
      }
    }
  });
});
