import { describe, it, expect } from 'vitest';

import {
  applyNixUpdate,
  readEnvList,
  readNixPackages,
  serializeEnvVars,
} from '../utils';
import type { EnvVar, WorkspaceNixPackage } from '../types';

describe('nodeProperties utils', () => {
  describe('readEnvList', () => {
    it('returns env vars with metadata and display values', () => {
      const result = readEnvList([
        {
          key: 'SECRET',
          value: { kind: 'vault', mount: 'secret', path: 'app/db', key: 'PASSWORD' },
          source: 'vault',
        },
        { name: 'PLAIN', value: 'text' },
      ]);

      expect(result).toHaveLength(2);
      const vaultVar = result[0]!;
      expect(vaultVar).toMatchObject({
        name: 'SECRET',
        value: 'secret/app/db/PASSWORD',
        source: 'vault',
        meta: { keyField: 'key', originalSource: 'vault' },
      });
      expect(vaultVar.meta.original).toEqual({
        key: 'SECRET',
        value: { kind: 'vault', mount: 'secret', path: 'app/db', key: 'PASSWORD' },
        source: 'vault',
      });

      const staticVar = result[1]!;
      expect(staticVar).toMatchObject({
        name: 'PLAIN',
        value: 'text',
        source: 'static',
        meta: { keyField: 'name', originalSource: undefined },
      });
    });

    it('ignores non-array input without converting maps to arrays', () => {
      expect(readEnvList({ FOO: 'bar' })).toEqual([]);
    });
  });

  describe('serializeEnvVars', () => {
    it('preserves key field and updates vault value in place', () => {
      const initial = readEnvList([
        {
          key: 'SECRET',
          value: { kind: 'vault', mount: 'secret', path: 'app/db', key: 'PASSWORD', extra: 'keep' },
          source: 'vault',
        },
      ]);

      const updated: EnvVar[] = initial.map((item) =>
        item.name === 'SECRET'
          ? { ...item, value: 'secret/app/db/NEW' }
          : item,
      );

      const payload = serializeEnvVars(updated);
      expect(payload).toEqual([
        {
          key: 'SECRET',
          source: 'vault',
          value: {
            kind: 'vault',
            mount: 'secret',
            path: 'app/db',
            key: 'NEW',
            extra: 'keep',
          },
        },
      ]);
    });

    it('omits source for static entries when none was provided originally', () => {
      const initial = readEnvList([{ name: 'PLAIN', value: 'x' }]);
      const payload = serializeEnvVars(initial.map((item) => ({ ...item, value: 'updated' })));
      expect(payload).toEqual([
        { name: 'PLAIN', value: 'updated' },
      ]);
    });

    it('retains additional fields on static object values', () => {
      const initial = readEnvList([{ name: 'CONFIG', value: { value: 'v1', extra: true } }]);
      const payload = serializeEnvVars(initial.map((item) => ({ ...item, value: 'v2' })));
      expect(payload).toEqual([
        { name: 'CONFIG', value: { value: 'v2', extra: true } },
      ]);
    });
  });

  describe('Nix helpers', () => {
    const sample: WorkspaceNixPackage[] = [{
      kind: 'nixpkgs',
      name: 'ripgrep',
      version: '13.0',
      commitHash: 'abc123',
      attributePath: 'pkgs.ripgrep',
    }];

    it('reads only config.nix.packages arrays', () => {
      expect(readNixPackages(sample)).toEqual([]);
      expect(readNixPackages({ packages: sample })).toEqual(sample);
      expect(readNixPackages({ packages: { not: 'array' } })).toEqual([]);
    });

    it('writes nix packages while preserving existing nix config', () => {
      const update = applyNixUpdate({ nix: { pinned: true } } as any, sample);
      expect(update).toEqual({
        nix: {
          pinned: true,
          packages: sample,
        },
      });
    });
  });
});
