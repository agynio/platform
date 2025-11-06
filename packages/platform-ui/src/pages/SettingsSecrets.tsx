import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Table, Thead, Tbody, Tr, Th, Td, Badge } from '@agyn/ui';
import { VaultWriteModal } from '@/components/graph/form/VaultWriteModal';
import { secretsApi, type SummaryItem } from '@/api/modules/secrets';
import { notifyError } from '@/lib/notify';

function useAdminToken(): [string, (v: string) => void] {
  const [tok, setTok] = useState<string>(() => {
    try { return localStorage.getItem('X-Admin-Token') || ''; } catch { return ''; }
  });
  function set(v: string) {
    setTok(v);
    try { if (v) localStorage.setItem("X-Admin-Token", v); else localStorage.removeItem("X-Admin-Token"); } catch { /* ignore */ }
  }
}

export function SettingsSecrets() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'used' | 'missing' | 'all'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [mount, setMount] = useState<string>('');
  const [pathPrefix, setPathPrefix] = useState<string>('');
  const [adminToken, setAdminToken] = useAdminToken();
  const [editing, setEditing] = useState<{ mount: string; path: string; key: string } | null>(null);

  const queryKey = useMemo(() => ['secrets', 'summary', { filter, page, pageSize, mount, pathPrefix }], [filter, page, pageSize, mount, pathPrefix]);
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => secretsApi.getSummary({ filter, page, page_size: pageSize, mount: mount || undefined, path_prefix: pathPrefix || undefined }),
  });

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Settings / Secrets</h1>
      <div className="text-sm text-muted-foreground mb-3">Secrets referenced by the current graph. Values are masked by default.</div>

      <div className="flex gap-2 items-center mb-3">
        <label className="text-xs">Filter:</label>
        <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => { setFilter('all'); setPage(1); }}>All</Button>
        <Button size="sm" variant={filter === 'used' ? 'default' : 'outline'} onClick={() => { setFilter('used'); setPage(1); }}>Used</Button>
        <Button size="sm" variant={filter === 'missing' ? 'default' : 'outline'} onClick={() => { setFilter('missing'); setPage(1); }}>Missing</Button>
        <div className="ml-4 flex items-center gap-1">
          <Input placeholder="Mount (optional)" value={mount} onChange={(e) => { setMount(e.target.value); setPage(1); }} />
          <Input placeholder="Path prefix (optional)" value={pathPrefix} onChange={(e) => { setPathPrefix(e.target.value); setPage(1); }} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Input placeholder="Admin token (optional)" type="password" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} />
        </div>
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Mount</Th>
            <Th>Path</Th>
            <Th>Key</Th>
            <Th>Status</Th>
            <Th>Value</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {isLoading ? (
            <Tr><Td colSpan={6}>Loading…</Td></Tr>
          ) : isError ? (
            <Tr><Td colSpan={6} className="text-red-600">Failed to load</Td></Tr>
          ) : !data || data.items.length === 0 ? (
            <Tr><Td colSpan={6} className="text-muted-foreground">No secrets.</Td></Tr>
          ) : (
            data.items.map((it) => (
              <SecretRow key={it.ref} item={it} adminToken={adminToken} onEdit={(m, p, k) => setEditing({ mount: m, path: p, key: k })} />
            ))
          )}
        </Tbody>
      </Table>

      {data && data.total > (data.page_size || 0) && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <span>Page {data.page} of {Math.max(1, Math.ceil((data.total || 0) / (data.page_size || 1)))}</span>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <Button size="sm" variant="outline" disabled={page >= Math.ceil((data.total || 0) / (data.page_size || 1))} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {editing && (
        <VaultWriteModal mount={editing.mount} path={editing.path} secretKey={editing.key} onClose={async (didWrite?: boolean) => {
          setEditing(null);
          if (didWrite) await qc.invalidateQueries({ queryKey });
        }} />
      )}
    </div>
  );
}

function SecretRow({ item, adminToken, onEdit }: { item: SummaryItem; adminToken?: string; onEdit: (mount: string, path: string, key: string) => void }) {
  const [state, setState] = useState<{ masked?: boolean; length?: number; value?: string; status?: 'present' | 'missing' | 'error'; loading?: boolean }>({});
  const canEdit = !!(item.mount && item.path && item.key) && item.status !== 'invalid_ref';
  async function toggleMaskedReveal(doReveal: boolean) {
    if (!item.mount || !item.path || !item.key) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await secretsApi.read(item.mount, item.path, item.key, { reveal: doReveal, adminToken });
      setState((s) => ({ ...s, loading: false, masked: res.masked, value: res.value, length: res.length, status: res.status }));
    } catch (e: unknown) {
      setState((s) => ({ ...s, loading: false }));
      notifyError(e instanceof Error ? e.message : 'Read failed');
    }
  }
  const statusBadge = (
    <Badge variant={item.status === 'used_missing' ? 'destructive' : item.status === 'invalid_ref' ? 'secondary' : 'outline'}>
      {item.status.replace('_', ' ')}
    </Badge>
  );
  return (
    <Tr>
      <Td className="font-mono text-xs">{item.mount || ''}</Td>
      <Td className="font-mono text-xs">{item.path || ''}</Td>
      <Td className="font-mono text-xs">{item.key || ''}</Td>
      <Td>{statusBadge}</Td>
      <Td className="text-xs">
        {state.loading ? 'Loading…' : state.value ? (
          <span className="font-mono break-all">{state.value}</span>
        ) : state.masked ? (
          <span className="text-muted-foreground">masked{typeof state.length === 'number' ? ` (len ${state.length})` : ''}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Td>
      <Td className="text-right">
        <div className="flex gap-2 justify-end">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(item.mount!, item.path!, item.key!)}>
              {item.status === 'used_missing' ? 'Create' : 'Edit'}
            </Button>
          )}
          {item.status !== 'invalid_ref' && (
            <>
              <Button size="sm" variant="outline" onClick={() => toggleMaskedReveal(false)}>Mask</Button>
              <Button size="sm" onClick={() => toggleMaskedReveal(true)}>Reveal</Button>
            </>
          )}
        </div>
      </Td>
    </Tr>
  );
}

