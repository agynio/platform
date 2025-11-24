import { describe, it, expect } from 'vitest';
import type { SecretEntry } from '@/api/modules/graph';
import { mapEntryToScreenSecret, parseKeyPath, toId, toKeyPath, type VaultSecretKey } from '../types';

describe('features/secrets types helpers', () => {
  it('builds consistent ids and key paths', () => {
    const key: VaultSecretKey = { mount: 'secret', path: 'github', key: 'TOKEN' };
    expect(toId(key)).toBe('secret::github::TOKEN');
    expect(toKeyPath(key)).toBe('secret/github/TOKEN');

    const rootKey: VaultSecretKey = { mount: 'secret', path: '', key: 'ROOT' };
    expect(toId(rootKey)).toBe('secret::::ROOT');
    expect(toKeyPath(rootKey)).toBe('secret/ROOT');
  });

  it('parses key paths with nested segments and rejects invalid values', () => {
    expect(parseKeyPath('secret/github/TOKEN')).toEqual({ mount: 'secret', path: 'github', key: 'TOKEN' });
    expect(parseKeyPath('secret/github/team/apiKey')).toEqual({ mount: 'secret', path: 'github/team', key: 'apiKey' });
    expect(parseKeyPath('secret/justKey')).toEqual({ mount: 'secret', path: '', key: 'justKey' });

    expect(parseKeyPath('')).toBeNull();
    expect(parseKeyPath('/')).toBeNull();
    expect(parseKeyPath('only-mount')).toBeNull();
  });

  it('maps secret entries into screen secrets with placeholder value', () => {
    const entry: SecretEntry = {
      mount: 'secret',
      path: 'github',
      key: 'TOKEN',
      required: true,
      present: false,
    };

    const mapped = mapEntryToScreenSecret(entry);
    expect(mapped).toMatchObject({
      id: 'secret::github::TOKEN',
      key: 'secret/github/TOKEN',
      value: '',
      status: 'missing',
      required: true,
      present: false,
    });
  });
});
