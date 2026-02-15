import { useMemo } from 'react';

import { graphApiService } from '@/features/graph/services/api';

export interface EntityNixServices {
  search: (query: string) => Promise<Array<{ value: string; label: string }>>;
  listVersions: (name: string) => Promise<string[]>;
  resolve: (
    name: string,
    version: string,
  ) => Promise<{ version: string; commitHash: string; attributePath: string }>;
}

export function useNixServices(): EntityNixServices {
  return useMemo(() => {
    const search = async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        return [];
      }
      try {
        const results = await graphApiService.searchNixPackages(trimmed);
        return results
          .map((item) => item?.name)
          .filter((name): name is string => typeof name === 'string' && name.length > 0)
          .map((name) => ({ value: name, label: name }));
      } catch {
        return [];
      }
    };

    const listVersions = async (name: string) => {
      if (!name) {
        return [];
      }
      try {
        const versions = await graphApiService.listNixPackageVersions(name);
        return versions
          .map((entry) => entry?.version)
          .filter((version): version is string => typeof version === 'string' && version.length > 0);
      } catch {
        return [];
      }
    };

    const resolve = async (name: string, version: string) => {
      const resolved = await graphApiService.resolveNixSelection(name, version);
      if (!resolved || typeof resolved.version !== 'string') {
        throw new Error('nix-resolve-invalid');
      }
      return {
        version: resolved.version,
        commitHash: resolved.commit,
        attributePath: resolved.attr,
      };
    };

    return { search, listVersions, resolve } satisfies EntityNixServices;
  }, []);
}
