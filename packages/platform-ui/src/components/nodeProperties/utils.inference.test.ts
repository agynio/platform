import { describe, expect, it } from 'vitest';

import { readEnvList, serializeEnvVars } from './utils';

describe('nodeProperties env inference', () => {
  it('infers vault and variable sources when source is omitted', () => {
    const result = readEnvList([
      { name: 'FROM_SECRET', value: { kind: 'vault', mount: 'kv', path: 'prod/app', key: 'TOKEN' } },
      { name: 'FROM_VAR', value: { kind: 'var', name: 'GLOBAL_TOKEN' } },
    ]);

    expect(result[0]).toMatchObject({
      name: 'FROM_SECRET',
      source: 'vault',
      value: 'kv/prod/app/TOKEN',
    });
    expect(result[0]?.meta.valueShape).toEqual({
      kind: 'vault',
      mount: 'kv',
      path: 'prod/app',
      key: 'TOKEN',
    });

    expect(result[1]).toMatchObject({
      name: 'FROM_VAR',
      source: 'variable',
      value: 'GLOBAL_TOKEN',
    });
    expect(result[1]?.meta.valueShape).toEqual({ kind: 'var', name: 'GLOBAL_TOKEN' });
  });

  it('round trips inferred env entries through serializeEnvVars', () => {
    const initial = readEnvList([
      { name: 'DB_SECRET', value: { mount: 'kv', path: 'prod/db', key: 'PASSWORD' } },
      { name: 'API_VAR', value: { name: 'API_TOKEN' } },
    ]);

    const payload = serializeEnvVars(initial);
    expect(payload).toEqual([
      { name: 'DB_SECRET', source: 'vault', value: { kind: 'vault', mount: 'kv', path: 'prod/db', key: 'PASSWORD' } },
      { name: 'API_VAR', source: 'variable', value: { kind: 'var', name: 'API_TOKEN' } },
    ]);
  });
});
