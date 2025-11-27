import { describe, it, expect } from 'vitest';

import {
  applyNixUpdate,
  readEnvList,
  readNixPackages,
  serializeEnvVars,
} from '../utils';
import type { WorkspaceNixPackage } from '../types';

describe('nodeProperties utils', () => {
  describe('readEnvList', () => {
    it('parses static, vault, and variable values', () => {
      const result = readEnvList([
        { key: 'STATIC', value: 'plain' },
        {
          key: 'SECRET',
          value: { kind: 'vault', mount: 'secret', path: 'app/db', key: 'PASSWORD' },
        },
        { key: 'VAR', value: { kind: 'var', name: 'FOO' } },
      ]);

      expect(result).toEqual([
        { key: 'STATIC', value: 'plain', source: 'static' },
        { key: 'SECRET', value: 'secret/app/db/PASSWORD', source: 'vault' },
        { key: 'VAR', value: 'FOO', source: 'variable' },
      ]);
    });

    it('handles legacy env map input', () => {
      const result = readEnvList({ FOO: 'bar', BAZ: 'qux' });
      expect(result).toEqual([
        { key: 'FOO', value: 'bar', source: 'static' },
        { key: 'BAZ', value: 'qux', source: 'static' },
      ]);
    });
  });

  describe('serializeEnvVars', () => {
    it('converts UI env vars back to reference-aware payloads', () => {
      const payload = serializeEnvVars([
        { key: 'STATIC', value: 'plain', source: 'static' },
        { key: 'SECRET', value: 'secret/app/db/PASSWORD', source: 'vault' },
        { key: 'VAR', value: 'FOO', source: 'variable' },
      ]);

      expect(payload).toEqual([
        { key: 'STATIC', value: 'plain' },
        {
          key: 'SECRET',
          value: {
            kind: 'vault',
            mount: 'secret',
            path: 'app/db',
            key: 'PASSWORD',
          },
        },
        {
          key: 'VAR',
          value: {
            kind: 'var',
            name: 'FOO',
          },
        },
      ]);
    });

    it('preserves partial vault references', () => {
      const payload = serializeEnvVars([{ key: 'SECRET', value: 'path/KEY', source: 'vault' }]);
      expect(payload).toEqual([
        {
          key: 'SECRET',
          value: {
            kind: 'vault',
            path: 'path',
            key: 'KEY',
          },
        },
      ]);
    });
  });

  describe('Nix helpers', () => {
    const sample: WorkspaceNixPackage[] = [{
      name: 'ripgrep',
      version: '13.0',
      commitHash: 'abc123',
      attributePath: 'pkgs.ripgrep',
    }];

    it('reads array and object nix shapes', () => {
      expect(readNixPackages(sample)).toEqual(sample);
      expect(readNixPackages({ packages: sample })).toEqual(sample);
      expect(readNixPackages(undefined)).toEqual([]);
    });

    it('writes nix packages under config.nix.packages', () => {
      const update = applyNixUpdate({} as any, sample);
      expect(update).toEqual({ nix: { packages: sample } });
    });
  });
});
