import { useMemo } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import type { PersistedGraph } from '@agyn/shared';
import * as api from '@/api/modules/graph';
import { computeRequiredKeys, computeSecretsUnion } from '@/api/modules/graph';
import type { SecretEntry } from '@/api/modules/graph';
import { mapEntryToScreenSecret, toId, type ScreenSecret } from '../types';
import { discoverVaultKeys } from '../utils/flatVault';

class VaultReadHydrationError extends Error {
  readonly failureCount: number;
  readonly partialValues: Map<string, string>;

  constructor(failureCount: number, partialValues: Map<string, string>) {
    super(`vault-read-failure:${failureCount}`);
    this.name = 'VaultReadHydrationError';
    this.failureCount = failureCount;
    this.partialValues = partialValues;
  }
}

export interface SecretsData {
  secrets: ScreenSecret[];
  entries: SecretEntry[];
  missingCount: number;
  requiredCount: number;
  isLoading: boolean;
  vaultUnavailable: boolean;
  mounts: string[];
  valuesIsError: boolean;
  valuesError: unknown;
  failedValueCount: number;
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

  const presentEntries = useMemo(() => entries.filter((entry) => entry.present), [entries]);

  const valuesQuery = useQuery({
    queryKey: ['vault', 'values', presentEntries.map((entry) => toId(entry))],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        presentEntries.map(async (entry) => {
          const res = await api.graph.readVaultKey(entry.mount, entry.path, entry.key);
          return { id: toId(entry), value: res.value ?? '' } as const;
        }),
      );

      const values = new Map<string, string>();
      let failureCount = 0;

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          values.set(result.value.id, result.value.value);
          continue;
        }

        const reason = result.reason;
        if (axios.isAxiosError(reason) && reason.response?.status === 404) {
          continue;
        }

        failureCount += 1;
      }

      if (failureCount > 0) {
        throw new VaultReadHydrationError(failureCount, values);
      }

      return values;
    },
    enabled: presentEntries.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const valuesMap = useMemo(() => {
    if (valuesQuery.data) return valuesQuery.data;
    const error = valuesQuery.error;
    if (error instanceof VaultReadHydrationError) {
      return error.partialValues;
    }
    return undefined;
  }, [valuesQuery.data, valuesQuery.error]);

  const secrets = useMemo(() => {
    const map = valuesMap;
    return entries.map((entry) => {
      const secret = mapEntryToScreenSecret(entry);
      if (!entry.present) return secret;
      const value = map?.get(toId(entry)) ?? '';
      return { ...secret, value };
    });
  }, [entries, valuesMap]);

  const missingCount = useMemo(() => entries.filter((entry) => entry.required && !entry.present).length, [entries]);
  const requiredCount = requiredKeys.length;

  const isLoading =
    graphQuery.isLoading ||
    mountsQuery.isLoading ||
    discoveryQuery.isLoading ||
    valuesQuery.isLoading;

  const vaultUnavailable = Boolean(
    mountsQuery.isError ||
      discoveryQuery.isError ||
      (mountsQuery.data && (mountsQuery.data.items || []).length === 0),
  );

  const failedValueCount = useMemo(() => {
    const error = valuesQuery.error;
    if (error instanceof VaultReadHydrationError) {
      return error.failureCount;
    }
    return 0;
  }, [valuesQuery.error]);

  return {
    secrets,
    entries,
    missingCount,
    requiredCount,
    isLoading,
    vaultUnavailable,
    mounts,
    valuesIsError: valuesQuery.isError,
    valuesError: valuesQuery.error,
    failedValueCount,
    graphError: graphQuery.error,
    mountsError: mountsQuery.error,
    discoveryError: discoveryQuery.error,
    refetchDiscover: discoveryQuery.refetch,
  };
}
