import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PersistedGraph } from '@agyn/shared';
import * as api from '@/api/modules/graph';
import { computeRequiredKeys, computeSecretsUnion } from '@/api/modules/graph';
import type { SecretEntry, SecretKey } from '@/api/modules/graph';
import { mapEntryToScreenSecret, type ScreenSecret } from '../types';

async function discoverVaultKeys(mounts: string[]): Promise<SecretKey[]> {
  async function listAllPaths(mount: string, prefix = ''): Promise<string[]> {
    const res = await api.graph.listVaultPaths(mount, prefix);
    const items = res.items || [];
    const folders = items.filter((item) => item.endsWith('/'));
    const leaves = items.filter((item) => !item.endsWith('/'));

    if (folders.length === 0) return leaves;

    const nested = await Promise.all(folders.map((folder) => listAllPaths(mount, `${folder}`)));
    return [...leaves, ...nested.flat()];
  }

  const keyLists = await Promise.all(
    mounts.map(async (mount) => {
      const paths = await listAllPaths(mount, '');
      const perPath = await Promise.all(
        paths.map(async (path) => {
          const keys = await api.graph.listVaultKeys(mount, path, { maskErrors: false });
          return (keys.items || []).map((key) => ({ mount, path, key } as SecretKey));
        }),
      );
      return perPath.flat();
    }),
  );

  return keyLists.flat();
}

export interface SecretsData {
  secrets: ScreenSecret[];
  entries: SecretEntry[];
  missingCount: number;
  requiredCount: number;
  isLoading: boolean;
  vaultUnavailable: boolean;
  mounts: string[];
  graphError: unknown;
  mountsError: unknown;
  discoveryError: unknown;
  refetchDiscover: () => Promise<unknown>;
}

export function useSecretsData(): SecretsData {
  const graphQuery = useQuery({
    queryKey: ['graph', 'full'],
    queryFn: () => api.graph.getFullGraph(),
  });

  const requiredKeys = useMemo(
    () => (graphQuery.data ? computeRequiredKeys(graphQuery.data as PersistedGraph) : []),
    [graphQuery.data],
  );

  const mountsQuery = useQuery({
    queryKey: ['vault', 'mounts'],
    queryFn: () => api.graph.listVaultMounts(),
    staleTime: 5 * 60 * 1000,
  });

  const mounts = mountsQuery.data?.items || [];

  const discoveryQuery = useQuery({
    queryKey: ['vault', 'discover', mounts],
    queryFn: () => discoverVaultKeys(mounts),
    enabled: mounts.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const entries = useMemo(
    () => computeSecretsUnion(requiredKeys, discoveryQuery.data ?? []),
    [requiredKeys, discoveryQuery.data],
  );

  const secrets = useMemo(() => entries.map(mapEntryToScreenSecret), [entries]);

  const missingCount = useMemo(() => entries.filter((entry) => entry.required && !entry.present).length, [entries]);
  const requiredCount = requiredKeys.length;

  const isLoading = graphQuery.isLoading || mountsQuery.isLoading || discoveryQuery.isLoading;

  const vaultUnavailable = Boolean(
    mountsQuery.isError ||
      discoveryQuery.isError ||
      (mountsQuery.data && (mountsQuery.data.items || []).length === 0),
  );

  return {
    secrets,
    entries,
    missingCount,
    requiredCount,
    isLoading,
    vaultUnavailable,
    mounts,
    graphError: graphQuery.error,
    mountsError: mountsQuery.error,
    discoveryError: discoveryQuery.error,
    refetchDiscover: discoveryQuery.refetch,
  };
}
