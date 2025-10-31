import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Button, Input, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@agyn/ui';
import { notifyError, notifySuccess } from '../lib/notify';

type VarItem = { key: string; graph: string | null; local: string | null };

async function fetchVariables(): Promise<VarItem[]> {
  const res = await fetch('/api/graph/variables');
  if (!res.ok) throw new Error('Failed to load variables');
  const body = (await res.json()) as { items: VarItem[] };
  return body.items;
}

export function SettingsVariables() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['variables'], queryFn: fetchVariables });
  const [newKey, setNewKey] = useState('');
  const [newGraph, setNewGraph] = useState('');

  const createMut = useMutation({
    mutationFn: async (payload: { key: string; graph: string }) => {
      const res = await fetch('/api/graph/variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(body?.error || 'Create failed');
      }
      return await res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['variables'] }); notifySuccess('Variable added'); },
    onError: (e: any) => {
      const msg = String(e?.message || 'Create failed');
      if (msg === 'DUPLICATE_KEY') notifyError('Key already exists');
      else if (msg === 'VERSION_CONFLICT') notifyError('Version conflict, please retry');
      else notifyError(msg);
    },
  });

  const updateMut = useMutation({
    mutationFn: async (args: { key: string; patch: { graph?: string | null; local?: string | null } }) => {
      const res = await fetch(`/api/graph/variables/${encodeURIComponent(args.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args.patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(body?.error || 'Update failed');
      }
      return await res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variables'] }),
    onError: (e: any) => {
      const msg = String(e?.message || 'Update failed');
      if (msg === 'BAD_VALUE') notifyError('Value cannot be empty');
      else if (msg === 'VERSION_CONFLICT') notifyError('Version conflict, please retry');
      else notifyError(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch(`/api/graph/variables/${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Delete failed');
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
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead>Graph</TableHead>
            <TableHead>Local</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={4}>Loading...</TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">No variables defined.</TableCell>
            </TableRow>
          ) : (
            data.map((item) => (
              <VariableRow key={item.key} item={item} onUpdate={(patch) => updateMut.mutate({ key: item.key, patch })} onDelete={() => deleteMut.mutate(item.key)} />
            ))
          )}
        </TableBody>
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
    <TableRow>
      <TableCell className="font-mono text-xs">{item.key}</TableCell>
      <TableCell>
        <Input value={graph} onChange={(e) => {
          const v = e.target.value;
          setGraph(v);
          if (graphTimer.current) window.clearTimeout(graphTimer.current);
          graphTimer.current = window.setTimeout(() => onUpdate({ graph: v.trim() }), debounceMs);
        }} />
      </TableCell>
      <TableCell>
        <Input value={local} onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          if (localTimer.current) window.clearTimeout(localTimer.current);
          localTimer.current = window.setTimeout(() => onUpdate({ local: v.trim() ? v : null }), debounceMs);
        }} />
      </TableCell>
      <TableCell className="text-right">
        <Button variant="destructive" size="sm" onClick={onDelete}>Remove</Button>
      </TableCell>
    </TableRow>
  );
}
