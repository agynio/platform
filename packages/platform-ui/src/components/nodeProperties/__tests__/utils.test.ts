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
        { name: 'STATIC', value: 'plain', source: 'static' },
        { name: 'SECRET', value: 'secret/app/db/PASSWORD', source: 'vault', meta: { mount: 'secret' } },
        { name: 'VAR', value: 'FOO', source: 'variable' },
      ]);
    });

    it('handles legacy env map input', () => {
      const result = readEnvList({ FOO: 'bar', BAZ: 'qux' });
      expect(result).toEqual([
        { name: 'FOO', value: 'bar', source: 'static' },
        { name: 'BAZ', value: 'qux', source: 'static' },
      ]);
    });
  });

  describe('serializeEnvVars', () => {
    it('converts UI env vars back to reference-aware payloads', () => {
      const payload = serializeEnvVars([
        { name: 'STATIC', value: 'plain', source: 'static' },
        { name: 'SECRET', value: 'secret/app/db/PASSWORD', source: 'vault', meta: { mount: 'secret' } },
        { name: 'VAR', value: 'FOO', source: 'variable' },
      ]);

      expect(payload).toEqual([
        { name: 'STATIC', value: 'plain' },
        {
          name: 'SECRET',
          value: {
            kind: 'vault',
            mount: 'secret',
            path: 'app/db',
            key: 'PASSWORD',
          },
        },
        {
          name: 'VAR',
          value: {
            kind: 'var',
            name: 'FOO',
          },
        },
      ]);
    });

    it('preserves partial vault references', () => {
      const payload = serializeEnvVars([{ name: 'SECRET', value: 'path/KEY', source: 'vault' }]);
      expect(payload).toEqual([
        {
          name: 'SECRET',
          value: {
            kind: 'vault',
            path: 'path',
            key: 'KEY',
          },
        },
      ]);
    });

    it('round-trips mountless vault paths containing slashes without assigning a mount', () => {
      const payload = serializeEnvVars([
        { name: 'SECRET', value: 'long/nested/path/API_KEY', source: 'vault' },
      ]);

      expect(payload).toEqual([
        {
          name: 'SECRET',
          value: {
            kind: 'vault',
            path: 'long/nested/path',
            key: 'API_KEY',
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
