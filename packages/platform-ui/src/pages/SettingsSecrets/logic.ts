import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PersistedGraph } from '@agyn/shared';
import * as api from '@/api/modules/graph';
import {
  computeRequiredKeys,
  computeSecretsUnion,
  type SecretEntry,
  type SecretFilter,
  type SecretKey,
} from '@/api/modules/graph';

async function discoverVaultKeys(mounts: string[]): Promise<SecretKey[]> {
  async function listAllPaths(mount: string, prefix = ''): Promise<string[]> {
    const res = await api.graph.listVaultPaths(mount, prefix);
    const items = res.items || [];
    const folders = items.filter((it) => it.endsWith('/'));
    const leaves = items.filter((it) => !it.endsWith('/'));
    if (folders.length === 0) return leaves;
    const nested = await Promise.all(folders.map((f) => listAllPaths(mount, `${f}`)));
    return [...leaves, ...nested.flat()];
  }

  const keyLists = await Promise.all(
    mounts.map(async (mount) => {
      const paths = await listAllPaths(mount, '');
      const perPath = await Promise.all(
        paths.map(async (p) => {
          const keys = await api.graph.listVaultKeys(mount, p, { maskErrors: false });
          return (keys.items || []).map((k) => ({ mount, path: p, key: k } satisfies SecretKey));
        }),
      );
      return perPath.flat();
    }),
  );
  return keyLists.flat();
}

interface FilterCounts {
  used: number;
  missing: number;
  all: number;
}

interface BannerState {
  kind: 'warning';
  message: string;
}

interface SecretsLogicResult {
  isLoading: boolean;
  banner: BannerState | null;
  filter: SecretFilter;
  onFilterChange: (value: SecretFilter) => void;
  entries: SecretEntry[];
  counts: FilterCounts;
  hasData: boolean;
}

export function useLogic(): SecretsLogicResult {
  const graphQ = useQuery({ queryKey: ['graph', 'full'], queryFn: () => api.graph.getFullGraph() });
  const requiredKeys = useMemo(
    () => (graphQ.data ? computeRequiredKeys(graphQ.data as PersistedGraph) : []),
    [graphQ.data],
  );

  const mountsQ = useQuery({
    queryKey: ['vault', 'mounts'],
    queryFn: () => api.graph.listVaultMounts(),
    staleTime: 5 * 60 * 1000,
  });
  const mounts = mountsQ.data?.items ?? [];

  const discoveryQ = useQuery({
    queryKey: ['vault', 'discover', mounts],
    queryFn: () => discoverVaultKeys(mounts),
    enabled: mounts.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const union = useMemo(
    () => computeSecretsUnion(requiredKeys, discoveryQ.data ?? []),
    [requiredKeys, discoveryQ.data],
  );

  const counts = useMemo<FilterCounts>(() => {
    const missing = union.filter((entry) => entry.required && !entry.present).length;
    const used = union.filter((entry) => entry.required).length;
    return { missing, used, all: union.length };
  }, [union]);

  const [filter, setFilter] = useState<SecretFilter>('used');

  const filtered = useMemo(() => {
    if (filter === 'missing') return union.filter((entry) => entry.required && !entry.present);
    if (filter === 'used') return union.filter((entry) => entry.required);
    return union;
  }, [union, filter]);

  const isLoading = graphQ.isLoading || mountsQ.isLoading || discoveryQ.isLoading;

  const hasDiscoveryError = Boolean(discoveryQ.isError);
  const mountsUnavailable = Boolean(mountsQ.isError || (mountsQ.data && mounts.length === 0));

  const banner: BannerState | null = useMemo(() => {
    if (hasDiscoveryError) {
      return {
        kind: 'warning',
        message: 'Vault error: failed to discover keys. Showing graph-required secrets only.',
      } satisfies BannerState;
    }
    if (mountsUnavailable) {
      return {
        kind: 'warning',
        message: 'Vault not configured or unavailable. Showing graph-required secrets only.',
      } satisfies BannerState;
    }
    return null;
  }, [hasDiscoveryError, mountsUnavailable]);

  return {
    isLoading,
    banner,
    filter,
    onFilterChange: setFilter,
    entries: filtered,
    counts,
    hasData: filtered.length > 0,
  };
}

export type { SecretEntry, SecretFilter };
