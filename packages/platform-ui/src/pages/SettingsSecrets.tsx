import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Table, Tbody, Td, Th, Thead, Tr, Tooltip, TooltipContent, TooltipTrigger } from '@agyn/ui';
import { AlertTriangle, Eye, EyeOff, Copy } from 'lucide-react';
import * as api from '@/api/modules/graph';
import type { PersistedGraph } from '@agyn/shared';
import { computeRequiredKeys, computeSecretsUnion } from '@/api/modules/graph';
import type { SecretEntry, SecretFilter, SecretKey } from '@/api/modules/graph';
import { notifyError, notifySuccess } from '@/lib/notify';

async function discoverVaultKeys(mounts: string[]): Promise<SecretKey[]> {
  // List all leaf paths for a mount using Promise.all and recursion
  async function listAllPaths(mount: string, prefix = ''): Promise<string[]> {
    const res = await api.graph.listVaultPaths(mount, prefix);
    const items = res.items || [];
    const folders = items.filter((it) => it.endsWith('/'));
    const leaves = items.filter((it) => !it.endsWith('/'));
    if (folders.length === 0) return leaves;
    const nested = await Promise.all(folders.map((f) => listAllPaths(mount, `${f}`)));
    return [...leaves, ...nested.flat()];
  }

  // For all mounts, fetch paths and then keys in parallel; any failure surfaces to useQuery.error
  const keyLists = await Promise.all(
    mounts.map(async (mount) => {
      const paths = await listAllPaths(mount, '');
      const perPath = await Promise.all(
        paths.map(async (p) => {
          const keys = await api.graph.listVaultKeys(mount, p, { maskErrors: false });
          return (keys.items || []).map((k) => ({ mount, path: p, key: k } as SecretKey));
        }),
      );
      return perPath.flat();
    }),
  );
  return keyLists.flat();
}

function useSecretsData() {
  const graphQ = useQuery({ queryKey: ['graph', 'full'], queryFn: () => api.graph.getFullGraph() });
  const reqKeys = useMemo(() => (graphQ.data ? computeRequiredKeys(graphQ.data as PersistedGraph) : []), [graphQ.data]);

  const mountsQ = useQuery({ queryKey: ['vault', 'mounts'], queryFn: () => api.graph.listVaultMounts(), staleTime: 5 * 60 * 1000 });
  const mounts = mountsQ.data?.items || [];

  const availQ = useQuery({
    queryKey: ['vault', 'discover', mounts],
    queryFn: () => discoverVaultKeys(mounts),
    enabled: mounts.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const union = useMemo(() => computeSecretsUnion(reqKeys, availQ.data ?? []), [reqKeys, availQ.data]);
  const missingCount = useMemo(() => union.filter((e) => e.required && !e.present).length, [union]);
  const requiredCount = reqKeys.length;
  const vaultUnavailable = Boolean(mountsQ.isError || availQ.isError || (mountsQ.data && mounts.length === 0));

  return { graphQ, mountsQ, availQ, union, missingCount, requiredCount, vaultUnavailable };
}

export function SettingsSecrets() {
  const { union, graphQ, availQ, mountsQ, missingCount, vaultUnavailable } = useSecretsData();
  const [filter, setFilter] = useState<SecretFilter>('used');

  // Default filter is 'used' per spec (no auto-switching)

  const filtered = useMemo(() => {
    if (filter === 'missing') return union.filter((e) => e.required && !e.present);
    if (filter === 'used') return union.filter((e) => e.required);
    return union;
  }, [union, filter]);

  const isLoading = graphQ.isLoading || mountsQ.isLoading || availQ.isLoading;

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Settings / Secrets</h1>
      <p className="text-sm text-muted-foreground mb-3">Manage Vault secrets used by the current graph.</p>

      {(vaultUnavailable || availQ.isError) && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm" role="status">
          {availQ.error ? 'Vault error: failed to discover keys. Showing graph-required secrets only.' : 'Vault not configured/unavailable. Showing graph-required secrets only.'}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <Button variant={filter === 'used' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('used')}>
          Used
        </Button>
        <Button variant={filter === 'missing' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('missing')}>
          Missing{missingCount ? ` (${missingCount})` : ''}
        </Button>
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>
          All
        </Button>
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Key</Th>
            <Th>Value</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {isLoading ? (
            <Tr><Td colSpan={3}>Loading...</Td></Tr>
          ) : filtered.length === 0 ? (
            <Tr><Td colSpan={3} className="text-muted-foreground">No secrets found.</Td></Tr>
          ) : (
            filtered.map((e) => (
              <SecretsRow key={`${e.mount}::${e.path}::${e.key}`} entry={e} />
            ))
          )}
        </Tbody>
      </Table>
    </div>
  );
}

export function SecretsRow({ entry }: { entry: SecretEntry }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [value, setValue] = useState('');
  // local read loading state intentionally not used to avoid global UI changes; may be used for future spinner

  useEffect(() => {
    if (!editing) {
      // Clear plaintext when exiting edit mode for security
      setValue('');
      setReveal(false);
    }
  }, [editing]);

  async function fetchCurrentValue() {
    try {
      const res = await api.graph.readVaultKey(entry.mount, entry.path, entry.key);
      if (res && typeof res.value === 'string') setValue(res.value);
      else notifyError('Failed to load value');
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 404) notifyError('No value available');
      else notifyError('Failed to load value');
    }
  }

  const writeMut = useMutation({
    mutationFn: async () => {
      const v = value.trim();
      if (!v) throw new Error('Value required');
      const res = await api.graph.writeVaultKey(entry.mount, { path: entry.path, key: entry.key, value: v });
      return res;
    },
    onSuccess: async () => {
      // Invalidate specific keys query and discovery
      await qc.invalidateQueries({ queryKey: ['vault', 'keys', entry.mount, entry.path] });
      await qc.invalidateQueries({ queryKey: ['vault', 'discover'] });
      notifySuccess('Secret saved');
      setEditing(false);
      // value cleared by effect
    },
    onError: (e: unknown) => {
      const msg = (e as Error)?.message || 'Write failed';
      notifyError(String(msg));
    },
  });

  async function onCopy() {
    try {
      if (!reveal) return; // do not copy masked values
      await navigator.clipboard.writeText(value);
      notifySuccess('Copied');
    } catch {
      // Surface error without leaking plaintext
      notifyError('Copy failed');
    }
  }

  const rowMissing = entry.required && !entry.present;
  const rowClass = rowMissing ? 'border-l-2 border-red-400' : '';

  return (
    <Tr className={rowClass} title={rowMissing ? 'Missing in Vault' : undefined}>
      <Td className="font-mono text-xs whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span>{entry.mount}/{entry.path}/{entry.key}</span>
          {rowMissing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="size-4 text-red-600" />
              </TooltipTrigger>
              <TooltipContent>Missing in Vault</TooltipContent>
            </Tooltip>
          )}
        </div>
      </Td>
      <Td>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type={reveal ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={reveal ? 'Enter secret value' : '••••'}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={reveal ? 'Hide' : 'Show'}
              onClick={async () => {
                setReveal((r) => !r);
                // If revealing while value is empty, fetch current value
                if (!reveal && !value) await fetchCurrentValue();
              }}
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Copy" onClick={onCopy} disabled={!reveal || !value}>
              <Copy className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm select-none">••••</div>
        )}
      </Td>
      <Td className="text-right whitespace-nowrap">
        {editing ? (
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" onClick={() => writeMut.mutate()} disabled={writeMut.isPending || !value.trim()}>{writeMut.isPending ? 'Saving…' : 'Save'}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={writeMut.isPending}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" onClick={async () => { setEditing(true); await fetchCurrentValue(); }}>Edit</Button>
        )}
      </Td>
    </Tr>
  );
}
