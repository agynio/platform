import { describe, expect, it } from 'vitest';

import { migrateValue } from '../../tools/graph-ref-migrate/transform';

const migrate = (
  value: unknown,
  options?: { defaultMount?: string; knownMounts?: string[]; validate?: boolean },
) =>
  migrateValue(
    value,
    {
      defaultMount: options?.defaultMount ?? 'secret',
      knownMounts: new Set(options?.knownMounts ?? ['secret']),
    },
    { validate: options?.validate ?? true },
  );

describe('migrateValue', () => {
  it('converts legacy vault references with explicit mount', () => {
    const input = {
      config: {
        auth: {
          bot: { source: 'vault', value: 'secret/slack/apps/bot-token' },
        },
      },
    };

    const result = migrate(input);

    expect(result.errors).toEqual([]);
    expect(result.conversions.map((c) => c.pointer)).toEqual(['/config/auth/bot']);
    expect(result.value).toEqual({
      config: {
        auth: {
          bot: { kind: 'vault', mount: 'secret', path: 'slack/apps', key: 'bot-token' },
        },
      },
    });
  });

  it('converts two-segment legacy vault references using default mount when first segment is unknown', () => {
    const input = { token: { source: 'vault', value: 'workspace/app-token' } };

    const result = migrate(input);

    expect(result.errors).toEqual([]);
    expect(result.conversions).toEqual([
      {
        pointer: '/token',
        kind: 'vault',
        legacy: 'vault',
        usedDefaultMount: true,
      },
    ]);
    expect(result.value).toEqual({
      token: { kind: 'vault', mount: 'secret', path: 'workspace', key: 'app-token' },
    });
  });

  it('flags two-segment legacy vault references as invalid when first segment matches known mount', () => {
    const input = { token: { source: 'vault', value: 'secret/api-key' } };

    const result = migrate(input);

    expect(result.changed).toBe(false);
    expect(result.conversions).toEqual([]);
    expect(result.errors).toContainEqual({
      pointer: '/token',
      message: 'Legacy vault reference missing path segment between mount and key',
    });
    expect(result.errors).toContainEqual({ pointer: '/token', message: 'Legacy reference remains after migration' });
  });

  it('honors custom known mounts when evaluating two-segment legacy vault references', () => {
    const input = { token: { source: 'vault', value: 'internal/api-key' } };

    const result = migrate(input, { knownMounts: ['secret', 'internal'] });

    expect(result.changed).toBe(false);
    expect(result.conversions).toEqual([]);
    expect(result.errors).toContainEqual({
      pointer: '/token',
      message: 'Legacy vault reference missing path segment between mount and key',
    });
    expect(result.errors).toContainEqual({ pointer: '/token', message: 'Legacy reference remains after migration' });
  });

  it('converts legacy env and static references and recurses through arrays', () => {
    const input = {
      env: { source: 'env', envVar: 'GH_TOKEN', default: 'fallback' },
      tags: [
        { source: 'static', value: 'alpha' },
        { source: 'env', envVar: 'SECONDARY' },
      ],
    };

    const result = migrate(input);

    expect(result.errors).toEqual([]);
    expect(result.changed).toBe(true);
    expect(
      result.conversions.map(({ pointer, kind, legacy }) => ({ pointer, kind, legacy })),
    ).toEqual([
      { pointer: '/env', kind: 'var', legacy: 'env' },
      { pointer: '/tags/0', kind: 'static', legacy: 'static' },
      { pointer: '/tags/1', kind: 'var', legacy: 'env' },
    ]);
    expect(result.value).toEqual({
      env: { kind: 'var', name: 'GH_TOKEN', default: 'fallback' },
      tags: ['alpha', { kind: 'var', name: 'SECONDARY' }],
    });
  });

  it('leaves canonical references untouched', () => {
    const input = {
      token: { kind: 'vault', mount: 'secret', path: 'services/github', key: 'token' },
      env: { kind: 'var', name: 'SLACK_TOKEN' },
    };

    const result = migrate(input);

    expect(result.changed).toBe(false);
    expect(result.conversions).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual(input);
  });

  it('reports errors for unconvertible legacy vault references', () => {
    const input = { secret: { source: 'vault', value: 'onlykey' } };

    const result = migrate(input);

    expect(result.changed).toBe(false);
    expect(result.conversions).toEqual([]);
    expect(result.errors).toContainEqual({
      pointer: '/secret',
      message: 'Legacy vault reference must include mount, path, and key segments',
    });
    expect(result.errors).toContainEqual({ pointer: '/secret', message: 'Legacy reference remains after migration' });
  });

  it('reports errors when legacy static value is not primitive', () => {
    const input = { ref: { source: 'static', value: { nested: true } } };

    const result = migrate(input);

    expect(result.changed).toBe(false);
    expect(result.conversions).toEqual([]);
    expect(result.errors).toContainEqual({
      pointer: '/ref',
      message: 'Legacy static reference must resolve to a primitive value',
    });
    expect(result.errors).toContainEqual({ pointer: '/ref', message: 'Legacy reference remains after migration' });
  });

  it('validates persisted graph node config schema', () => {
    const input = {
      id: 'node-1',
      template: 'example.node',
      config: 'not-an-object',
    };

    const result = migrate(input);

    expect(result.errors).toContainEqual({
      pointer: '/config',
      message: 'PersistedGraphNode.config must be an object when provided',
    });
  });
});
