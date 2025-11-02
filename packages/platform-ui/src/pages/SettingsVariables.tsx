import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Button, Input, Table, Thead, Tbody, Tr, Th, Td } from '@agyn/ui';
import { notifyError, notifySuccess } from '../lib/notify';
import { httpJson } from '../lib/apiClient';

type VarItem = { key: string; graph: string | null; local: string | null };

async function fetchVariables(): Promise<VarItem[]> {
  const data = await httpJson<{ items: VarItem[] }>(`/api/graph/variables`);
  return data?.items ?? [];
}

export function SettingsVariables() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['variables'], queryFn: fetchVariables });
  const [newKey, setNewKey] = useState('');
  const [newGraph, setNewGraph] = useState('');

  const createMut = useMutation<{ key: string; graph: string }, Error, { key: string; graph: string }>({
    mutationFn: async (payload: { key: string; graph: string }) => {
      try {
        return (await httpJson<{ key: string; graph: string }>(`/api/graph/variables`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })) as { key: string; graph: string };
      } catch (e) {
        // Attempt to surface server-provided error codes
        const msg = String((e as Error)?.message || 'Create failed');
        try {
          const idx = msg.indexOf(':');
          const raw = idx >= 0 ? msg.slice(idx + 1).trim() : msg;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            throw new Error((parsed as { error?: string }).error || 'Create failed');
          }
        } catch {
          /* swallow parse errors */
        }
        throw new Error(msg);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['variables'] }); notifySuccess('Variable added'); },
    onError: (e: Error) => {
      const msg = String(e?.message || 'Create failed');
      if (msg === 'DUPLICATE_KEY') notifyError('Key already exists');
      else if (msg === 'VERSION_CONFLICT') notifyError('Version conflict, please retry');
      else notifyError(msg);
    },
  });

  const updateMut = useMutation<{ key: string; graph?: string | null; local?: string | null }, Error, { key: string; patch: { graph?: string | null; local?: string | null } }>({
    mutationFn: async (args: { key: string; patch: { graph?: string | null; local?: string | null } }) => {
      try {
        return (await httpJson<{ key: string; graph?: string | null; local?: string | null }>(`/api/graph/variables/${encodeURIComponent(args.key)}`, {
          method: 'PUT',
          body: JSON.stringify(args.patch),
        })) as { key: string; graph?: string | null; local?: string | null };
      } catch (e) {
        const msg = String((e as Error)?.message || 'Update failed');
        try {
          const idx = msg.indexOf(':');
          const raw = idx >= 0 ? msg.slice(idx + 1).trim() : msg;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            throw new Error((parsed as { error?: string }).error || 'Update failed');
          }
        } catch {
          /* swallow parse errors */
        }
        throw new Error(msg);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variables'] }),
    onError: (e: Error) => {
      const msg = String(e?.message || 'Update failed');
      if (msg === 'BAD_VALUE') notifyError('Value cannot be empty');
      else if (msg === 'VERSION_CONFLICT') notifyError('Version conflict, please retry');
      else notifyError(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (key: string) => {
      await httpJson<void>(`/api/graph/variables/${encodeURIComponent(key)}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variables'] }),
  });

  const existingKeys = useMemo(() => new Set(data.map((d) => d.key)), [data]);
  function addVariable() {
    const key = newKey.trim();
    const graph = newGraph.trim();
    if (!key || !graph) { notifyError('Key and Graph value are required'); return; }
    if (existingKeys.has(key)) { notifyError('Key already exists'); return; }
    createMut.mutate({ key, graph });
    setNewKey('');
    setNewGraph('');
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Settings / Variables</h1>
      <p className="text-sm text-muted-foreground mb-4">Define graph defaults and optional local overrides. Edits autosave.</p>

      <div className="mb-3 flex items-center gap-2">
        <Input placeholder="Key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <Input placeholder="Graph value" value={newGraph} onChange={(e) => setNewGraph(e.target.value)} />
        <Button onClick={addVariable} disabled={!newKey.trim() || !newGraph.trim() || createMut.isPending}>Add</Button>
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Key</Th>
            <Th>Graph</Th>
            <Th>Local</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {isLoading ? (
            <Tr>
              <Td colSpan={4}>Loading...</Td>
            </Tr>
          ) : data.length === 0 ? (
            <Tr>
              <Td colSpan={4} className="text-muted-foreground">No variables defined.</Td>
            </Tr>
          ) : (
            data.map((item) => (
              <VariableRow key={item.key} item={item} onUpdate={(patch) => updateMut.mutate({ key: item.key, patch })} onDelete={() => deleteMut.mutate(item.key)} />
            ))
          )}
        </Tbody>
      </Table>
    </div>
  );
}

function VariableRow({ item, onUpdate, onDelete }: { item: VarItem; onUpdate: (patch: { graph?: string | null; local?: string | null }) => void; onDelete: () => void }) {
  const [graph, setGraph] = useState(item.graph || '');
  const [local, setLocal] = useState(item.local || '');
  const graphTimer = useRef<number | null>(null);
  const localTimer = useRef<number | null>(null);
  const debounceMs = 600;

  return (
    <Tr>
      <Td className="font-mono text-xs">{item.key}</Td>
      <Td>
        <Input value={graph} onChange={(e) => {
          const v = e.target.value;
          setGraph(v);
          if (graphTimer.current) window.clearTimeout(graphTimer.current);
          graphTimer.current = window.setTimeout(() => onUpdate({ graph: v.trim() }), debounceMs);
        }} />
      </Td>
      <Td>
        <Input value={local} onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          if (localTimer.current) window.clearTimeout(localTimer.current);
          localTimer.current = window.setTimeout(() => onUpdate({ local: v.trim() ? v : null }), debounceMs);
        }} />
      </Td>
      <Td className="text-right">
        <Button variant="destructive" size="sm" onClick={onDelete}>Remove</Button>
      </Td>
    </Tr>
  );
}
