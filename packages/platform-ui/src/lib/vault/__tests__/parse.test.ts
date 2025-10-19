import { describe, it, expect } from 'vitest';
import { parseVaultRef, isValidVaultRef } from '../../vault/parse';

describe('vault parse helpers', () => {
  it('parseVaultRef handles empty and leading slash', () => {
    expect(parseVaultRef(undefined)).toEqual({});
    expect(parseVaultRef('')).toEqual({});
    expect(parseVaultRef('/a/b/c')).toEqual({});
  });

  it('parseVaultRef for partials', () => {
    expect(parseVaultRef('secret')).toEqual({ mount: 'secret' });
    expect(parseVaultRef('secret/pathPrefix')).toEqual({ mount: 'secret', pathPrefix: 'pathPrefix' });
  });

  it('parseVaultRef for full refs', () => {
    expect(parseVaultRef('secret/github/GH_TOKEN')).toEqual({ mount: 'secret', path: 'github', key: 'GH_TOKEN' });
    expect(parseVaultRef('a/b/c/d')).toEqual({ mount: 'a', path: 'b/c', key: 'd' });
  });

  it('isValidVaultRef validates minimal length and no leading slash', () => {
    expect(isValidVaultRef(undefined)).toBe(true);
    expect(isValidVaultRef('')).toBe(true);
    expect(isValidVaultRef('/a/b/c')).toBe(false);
    expect(isValidVaultRef('a/b')).toBe(false);
    expect(isValidVaultRef('a/b/c')).toBe(true);
  });
});

