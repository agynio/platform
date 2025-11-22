import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SecretsScreen, type Secret as UiSecret, Alert, AlertTitle, AlertDescription } from '@agyn/ui-new';
import { notifyError, notifySuccess } from '@/lib/notify';
import * as graphApi from '@/api/modules/graph';
import type { PersistedGraph } from '@agyn/shared';
import { computeRequiredKeys, computeSecretsUnion } from '@/api/modules/graph';
import type { SecretEntry, SecretKey } from '@/api/modules/graph';

async function discoverVaultKeys(mounts: string[]): Promise<SecretKey[]> {
  async function listAllPaths(mount: string, prefix = ''): Promise<string[]> {
    const res = await graphApi.graph.listVaultPaths(mount, prefix);
    const items = res.items || [];
    const folders = items.filter((it) => it.endsWith('/'));
    const leaves = items.filter((it) => !it.endsWith('/'));
    if (folders.length === 0) return leaves;
    const nested = await Promise.all(folders.map((folder) => listAllPaths(mount, `${folder}`)));
    return [...leaves, ...nested.flat()];
  }

  const keyLists = await Promise.all(
    mounts.map(async (mount) => {
      const paths = await listAllPaths(mount, '');
      const perPath = await Promise.all(
        paths.map(async (path) => {
          const keys = await graphApi.graph.listVaultKeys(mount, path, { maskErrors: false });
          return (keys.items || []).map((key) => ({ mount, path, key } satisfies SecretKey));
        })
      );
      return perPath.flat();
    })
  );

  return keyLists.flat();
}

function useSecretsData() {
  const graphQuery = useQuery({ queryKey: ['graph', 'full'], queryFn: () => graphApi.graph.getFullGraph() });
  const requiredKeys = useMemo(
    () => (graphQuery.data ? computeRequiredKeys(graphQuery.data as PersistedGraph) : []),
    [graphQuery.data]
  );

  const mountsQuery = useQuery({
    queryKey: ['vault', 'mounts'],
    queryFn: () => graphApi.graph.listVaultMounts(),
    staleTime: 5 * 60 * 1000,
  });
  const mounts = mountsQuery.data?.items ?? [];

  const availableQuery = useQuery({
    queryKey: ['vault', 'discover', mounts],
    queryFn: () => discoverVaultKeys(mounts),
    enabled: mounts.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const union = useMemo(() => computeSecretsUnion(requiredKeys, availableQuery.data ?? []), [requiredKeys, availableQuery.data]);
  const loading = graphQuery.isLoading || mountsQuery.isLoading || availableQuery.isLoading;
  const error = graphQuery.error ?? mountsQuery.error ?? availableQuery.error ?? null;
  const vaultUnavailable = Boolean(mountsQuery.isError || availableQuery.isError || (mountsQuery.data && mounts.length === 0));

  return {
    union,
    loading,
    error,
    vaultUnavailable,
  };
}

function parseSecretIdentifier(input: string): SecretKey | null {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return null;
  const parts = trimmed.split('/');
  if (parts.length < 2) return null;
  const mount = parts[0]?.trim();
  const key = parts.pop()?.trim();
  if (!mount || !key) return null;
  const path = parts.slice(1).join('/');
  return { mount, path, key };
}

export function SettingsSecretsNew() {
  const qc = useQueryClient();
  const { union, loading, error, vaultUnavailable } = useSecretsData();

  const secrets = useMemo<UiSecret[]>(() => {
    return union.map((entry) => ({
      id: `${entry.mount}::${entry.path}::${entry.key}`,
      key: `${entry.mount}/${entry.path ? `${entry.path}/` : ''}${entry.key}`.replace('//', '/'),
      value: entry.present ? '••••' : '',
      status: entry.present ? 'used' : 'missing',
    } satisfies UiSecret));
  }, [union]);

  const entryById = useMemo(() => {
    const map = new Map<string, SecretEntry>();
    for (const entry of union) {
      const id = `${entry.mount}::${entry.path}::${entry.key}`;
      map.set(id, entry);
    }
    return map;
  }, [union]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: { key: string; value: string }) => {
      const parsed = parseSecretIdentifier(payload.key);
      if (!parsed) throw new Error('Secrets must be in "mount/path/key" format');
      const nextValue = payload.value.trim();
      if (!nextValue) throw new Error('Value required');
      await graphApi.graph.writeVaultKey(parsed.mount, { path: parsed.path, key: parsed.key, value: nextValue });
    },
    onSuccess: async () => {
      notifySuccess('Secret saved');
      await qc.invalidateQueries({ queryKey: ['vault', 'discover'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to save secret';
      notifyError(message);
    },
  });

  const handleCreateSecret = (secret: Omit<UiSecret, 'id'>) => {
    const key = typeof secret.key === 'string' ? secret.key : '';
    const value = typeof secret.value === 'string' ? secret.value : '';
    void upsertMutation.mutate({ key, value });
  };

  const handleUpdateSecret = (id: string, secret: Omit<UiSecret, 'id'>) => {
    const current = entryById.get(id);
    const providedKey = typeof secret.key === 'string' ? secret.key : '';
    const keyCandidate = providedKey || (current ? `${current.mount}/${current.path ? `${current.path}/` : ''}${current.key}` : '');
    const value = typeof secret.value === 'string' ? secret.value : '';
    void upsertMutation.mutate({ key: keyCandidate, value });
  };

  const handleDeleteSecret = (id: string) => {
    const entry = entryById.get(id);
    if (!entry) {
      notifyError('Secret not found');
      return;
    }
    notifyError('Deleting secrets is not supported. Overwrite the value instead.');
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading secrets…</div>;
  }

  if (error) {
    const message = error instanceof Error ? error.message : 'Failed to load secrets';
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {message}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {vaultUnavailable && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTitle>Vault unavailable</AlertTitle>
          <AlertDescription>
            Showing graph-required secrets only. Vault discovery is currently unavailable.
          </AlertDescription>
        </Alert>
      )}
      <SecretsScreen
        secrets={secrets}
        onCreateSecret={handleCreateSecret}
        onUpdateSecret={handleUpdateSecret}
        onDeleteSecret={handleDeleteSecret}
        renderSidebar={false}
      />
    </div>
  );
}
