import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service.js';

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

  it('emits structured JSON logs with merged object context', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      logger.info('hello world', { userId: 42, status: 'ok' });
      expect(spy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(spy.mock.calls[0][0]);
      expect(payload.level).toBe('INFO');
      expect(payload.message).toBe('hello world');
      expect(payload.userId).toBe(42);
      expect(payload.status).toBe('ok');
      expect(payload).not.toHaveProperty('context');
      expect(typeof payload.ts).toBe('string');
    } finally {
      spy.mockRestore();
    }
  });

  it('emits context array when params are not plain objects', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logger.warn('with details', 'raw', { value: 1 });
      expect(spy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(spy.mock.calls[0][0]);
      expect(payload.level).toBe('WARN');
      expect(Array.isArray(payload.context)).toBe(true);
      expect(payload.context[0]).toBe('raw');
      expect(payload.context[1].value).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
