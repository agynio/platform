import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memoryApi, type MemoryDocItem, type ListEntry } from '../api/modules/memory';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@agyn/ui';

export function SettingsMemory() {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ['memory/docs'], queryFn: () => memoryApi.listDocs() });
  const [nodeId, setNodeId] = useState<string>('');
  const [scope, setScope] = useState<'global'|'perThread'>('global');
  const [threadId, setThreadId] = useState<string>('');
  const [path, setPath] = useState<string>('/');
  const [selected, setSelected] = useState<ListEntry | null>(null);
  const list = useQuery({ queryKey: ['memory/list', nodeId, scope, threadId, path], queryFn: () => memoryApi.list(nodeId, scope, scope==='perThread' ? threadId || undefined : undefined, path), enabled: !!nodeId && !!scope });
  const stat = useQuery({ queryKey: ['memory/stat', nodeId, scope, threadId, path], queryFn: () => memoryApi.stat(nodeId, scope, scope==='perThread' ? threadId || undefined : undefined, path), enabled: !!nodeId && !!scope && !!path });
  const read = useQuery({ queryKey: ['memory/read', nodeId, scope, threadId, path], queryFn: () => memoryApi.read(nodeId, scope, scope==='perThread' ? threadId || undefined : undefined, path), enabled: !!nodeId && !!scope && !!path && (stat.data?.kind === 'file') });

  useEffect(() => { setSelected(null); }, [nodeId, scope, threadId, path]);

  const append = useMutation({ mutationFn: async (payload: { data: string }) => memoryApi.append(nodeId, scope, scope==='perThread' ? threadId || undefined : undefined, path, payload.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['memory/read', nodeId, scope, threadId, path] }); } });
  const update = useMutation({ mutationFn: async (payload: { oldStr: string; newStr: string }) => memoryApi.update(nodeId, scope, scope==='perThread' ? threadId || undefined : undefined, path, payload.oldStr, payload.newStr), onSuccess: () => { qc.invalidateQueries({ queryKey: ['memory/read', nodeId, scope, threadId, path] }); } });
  const ensureDir = useMutation({ mutationFn: async () => memoryApi.ensureDir(nodeId, scope, scope==='perThread' ? threadId || undefined : undefined, path), onSuccess: () => { qc.invalidateQueries({ queryKey: ['memory/list', nodeId, scope, threadId, path] }); } });
  const del = useMutation({ mutationFn: async () => memoryApi.delete(nodeId, scope, scope==='perThread' ? threadId || undefined : undefined, path), onSuccess: () => { qc.invalidateQueries({ queryKey: ['memory/list', nodeId, scope, threadId, path] }); } });

  const globalNodes = useMemo(() => (docs.data?.items || []).filter((d) => d.scope === 'global').map((d) => d.nodeId), [docs.data]);
  const perThreadNodes = useMemo(() => (docs.data?.items || []).filter((d) => d.scope === 'perThread').map((d) => ({ nodeId: d.nodeId, threadId: d.threadId! })), [docs.data]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Memory Administration</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <Label>Scope</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as any)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select scope" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">global</SelectItem>
              <SelectItem value="perThread">perThread</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Node ID</Label>
          <Input value={nodeId} onChange={(e) => setNodeId(e.target.value)} placeholder="node id" />
          <div className="text-xs text-muted-foreground mt-1">Known: {globalNodes.join(', ')}</div>
        </div>
        {scope === 'perThread' ? (
          <div>
            <Label>Thread ID</Label>
            <Input value={threadId} onChange={(e) => setThreadId(e.target.value)} placeholder="thread id" />
            <div className="text-xs text-muted-foreground mt-1">Known: {perThreadNodes.map((x) => `${x.nodeId}:${x.threadId}`).join(', ')}</div>
          </div>
        ) : null}
        <div>
          <Label>Path</Label>
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Entries</h2>
          <div className="rounded border p-2 min-h-[200px]">
            {list.data?.items?.length ? (
              <ul className="space-y-1">
                {list.data.items.map((e) => (
                  <li key={e.name}>
                    <button className="text-sm hover:underline" onClick={() => setSelected(e)}>
                      <span className="mr-2 inline-block rounded px-1 text-xs bg-muted">{e.kind}</span>
                      {e.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (<div className="text-sm text-muted-foreground">No entries</div>)}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Details</h2>
          {stat.data?.kind === 'file' ? (
            <div className="space-y-2">
              <Textarea className="min-h-[160px]" readOnly value={read.data?.content || ''} />
              <div className="flex gap-2">
                <Textarea placeholder="Append text" onBlur={(e) => append.mutate({ data: e.target.value })} />
                <Button onClick={() => append.mutate({ data: '' })} disabled={append.isPending}>Append</Button>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Replace</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="old" id="oldStr" />
                    <Input placeholder="new" id="newStr" />
                  </div>
                </div>
                <Button onClick={() => {
                  const oldStr = (document.getElementById('oldStr') as HTMLInputElement)?.value || '';
                  const newStr = (document.getElementById('newStr') as HTMLInputElement)?.value || '';
                  update.mutate({ oldStr, newStr });
                }} disabled={update.isPending}>Apply</Button>
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>Delete file</Button>
              </div>
            </div>
          ) : stat.data?.kind === 'dir' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button onClick={() => ensureDir.mutate()} disabled={ensureDir.isPending}>Ensure dir</Button>
                <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>Delete dir</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button onClick={() => ensureDir.mutate()} disabled={ensureDir.isPending}>Create dir</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

