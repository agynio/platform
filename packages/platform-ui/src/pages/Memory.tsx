import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memoryApi, type ListEntry, type MemoryDocItem } from '../api/modules/memory';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@agyn/ui';

export function Memory() {
  const qc = useQueryClient();
  const docs = useQuery<{ items: MemoryDocItem[] }>({ queryKey: ['memory/docs'], queryFn: () => memoryApi.listDocs() });
  const [nodeId, setNodeId] = useState('');
  const [scope, setScope] = useState<'global' | 'perThread'>('global');
  const [threadId, setThreadId] = useState('');
  const [path, setPath] = useState('/');
  const [appendText, setAppendText] = useState('');
  const [replaceOld, setReplaceOld] = useState('');
  const [replaceNew, setReplaceNew] = useState('');

  const currentThread = scope === 'perThread' ? threadId || undefined : undefined;

  const list = useQuery<{ items: ListEntry[] }>({
    queryKey: ['memory/list', nodeId, scope, currentThread, path],
    queryFn: () => memoryApi.list(nodeId, scope, currentThread, path),
    enabled: !!nodeId,
  });

  const stat = useQuery<{ kind: 'file' | 'dir' | 'none'; size?: number }>({
    queryKey: ['memory/stat', nodeId, scope, currentThread, path],
    queryFn: () => memoryApi.stat(nodeId, scope, currentThread, path),
    enabled: !!nodeId && !!path,
  });

  const read = useQuery<{ content: string }>({
    queryKey: ['memory/read', nodeId, scope, currentThread, path],
    queryFn: () => memoryApi.read(nodeId, scope, currentThread, path),
    enabled: !!nodeId && !!path && stat.data?.kind === 'file',
  });

  useEffect(() => {
    setAppendText('');
    setReplaceOld('');
    setReplaceNew('');
  }, [nodeId, scope, threadId, path]);

  const invalidateList = () => qc.invalidateQueries({ queryKey: ['memory/list', nodeId, scope, currentThread, path] });
  const invalidateRead = () => qc.invalidateQueries({ queryKey: ['memory/read', nodeId, scope, currentThread, path] });
  const invalidateStat = () => qc.invalidateQueries({ queryKey: ['memory/stat', nodeId, scope, currentThread, path] });

  const append = useMutation({
    mutationFn: async (payload: { data: string }) => memoryApi.append(nodeId, scope, currentThread, path, payload.data),
    onSuccess: () => {
      invalidateRead();
      invalidateList();
    },
  });

  const update = useMutation({
    mutationFn: async (payload: { oldStr: string; newStr: string }) =>
      memoryApi.update(nodeId, scope, currentThread, path, payload.oldStr, payload.newStr),
    onSuccess: () => {
      invalidateRead();
    },
  });

  const ensureDir = useMutation({
    mutationFn: async () => memoryApi.ensureDir(nodeId, scope, currentThread, path),
    onSuccess: () => {
      invalidateList();
      invalidateStat();
    },
  });

  const del = useMutation({
    mutationFn: async () => memoryApi.delete(nodeId, scope, currentThread, path),
    onSuccess: () => {
      invalidateList();
      invalidateStat();
      invalidateRead();
    },
  });

  const globalNodes = useMemo(
    () => (docs.data?.items || []).filter((d: MemoryDocItem) => d.scope === 'global').map((d) => d.nodeId),
    [docs.data],
  );

  const perThreadNodes = useMemo(
    () =>
      (docs.data?.items || [])
        .filter((d: MemoryDocItem) => d.scope === 'perThread')
        .map((d) => ({ nodeId: d.nodeId, threadId: d.threadId! })),
    [docs.data],
  );

  const handleAppend = () => {
    if (!appendText.trim()) return;
    append.mutate({ data: appendText });
    setAppendText('');
  };

  const handleUpdate = () => {
    if (!replaceOld) return;
    update.mutate({ oldStr: replaceOld, newStr: replaceNew });
  };

  const formatPath = (next: string) => {
    const normalized = next.startsWith('/') ? next : `/${next}`;
    const collapsed = normalized.replace(/\/+/g, '/');
    return collapsed === '' ? '/' : collapsed;
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Memory</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
        <div>
          <Label>Scope</Label>
          <Select value={scope} onValueChange={(v: string) => setScope(v as 'global' | 'perThread')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">global</SelectItem>
              <SelectItem value="perThread">perThread</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Node ID</Label>
          <Input value={nodeId} onChange={(e) => setNodeId(e.target.value)} placeholder="node id" />
          <div className="mt-1 text-xs text-muted-foreground">Known: {globalNodes.join(', ') || '—'}</div>
        </div>
        {scope === 'perThread' ? (
          <div>
            <Label>Thread ID</Label>
            <Input value={threadId} onChange={(e) => setThreadId(e.target.value)} placeholder="thread id" />
            <div className="mt-1 text-xs text-muted-foreground">
              Known: {perThreadNodes.map((x) => `${x.nodeId}:${x.threadId}`).join(', ') || '—'}
            </div>
          </div>
        ) : null}
        <div>
          <Label>Path</Label>
          <Input value={path} onChange={(e) => setPath(formatPath(e.target.value))} placeholder="/" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Entries</h2>
          <div className="min-h-[200px] rounded border p-2">
            {list.data?.items?.length ? (
              <ul className="space-y-1">
                {list.data.items.map((entry) => (
                  <li key={`${path}|${entry.name}`}>
                    <button
                      className="text-sm hover:underline"
                      onClick={() => {
                        const base = path && path !== '/' ? path : '';
                        const next = formatPath(`${base}/${entry.name}`);
                        setPath(next);
                      }}
                    >
                      <span className="mr-2 inline-block rounded px-1 text-xs bg-muted">{entry.kind}</span>
                      {entry.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">No entries</div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Details</h2>
          {stat.data?.kind === 'file' ? (
            <div className="space-y-3">
              <Textarea className="min-h-[160px]" readOnly value={read.data?.content || ''} />
              <div className="flex flex-col gap-2 md:flex-row">
                <Textarea
                  className="flex-1"
                  placeholder="Append text"
                  value={appendText}
                  onChange={(e) => setAppendText(e.target.value)}
                />
                <Button onClick={handleAppend} disabled={append.isPending || !appendText.trim()}>
                  Append
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Replace</Label>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <Input placeholder="old" value={replaceOld} onChange={(e) => setReplaceOld(e.target.value)} />
                  <Input placeholder="new" value={replaceNew} onChange={(e) => setReplaceNew(e.target.value)} />
                </div>
                <Button onClick={handleUpdate} disabled={update.isPending || !replaceOld}>
                  Apply
                </Button>
              </div>
              <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
                Delete file
              </Button>
            </div>
          ) : stat.data?.kind === 'dir' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button onClick={() => ensureDir.mutate()} disabled={ensureDir.isPending}>
                  Ensure dir
                </Button>
                <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
                  Delete dir
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button onClick={() => ensureDir.mutate()} disabled={ensureDir.isPending}>
                Create dir
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
