import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { memoryApi, type MemoryDocItem } from '@/api/modules/memory';
import { MemoryManager } from '@/components/screens/memoryManager/MemoryManager';
import type { MemoryTree, MemoryNode } from '@/components/screens/memoryManager/utils';
import { getParentPath, joinPath, normalizePath } from '@/components/screens/memoryManager/utils';

const ROOT_PATH = '/' as const;

type MemoryNodeOption = {
  key: string;
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  label: string;
};

type DumpResponse = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  data: Record<string, string>;
  dirs: Record<string, true>;
};

type DocumentState = {
  loading: boolean;
  exists: boolean;
  error: string | null;
};

function buildNodeKey(item: MemoryDocItem): string {
  if (item.scope === 'perThread') {
    return item.threadId ? `${item.nodeId}::thread::${item.threadId}` : `${item.nodeId}::per-thread`;
  }
  return `${item.nodeId}::global`;
}

function buildNodeLabel(item: MemoryDocItem): string {
  if (item.scope === 'perThread') {
    const thread = item.threadId ?? 'unknown';
    return `${item.nodeId} (thread: ${thread})`;
  }
  return `${item.nodeId} (global)`;
}

function ensureNode(map: Map<string, MemoryNode>, root: MemoryTree, path: string): MemoryNode {
  const normalized = normalizePath(path);
  if (normalized === ROOT_PATH) return root;
  if (map.has(normalized)) return map.get(normalized)!;

  const parentPath = getParentPath(normalized) ?? ROOT_PATH;
  const parent = ensureNode(map, root, parentPath);
  const name = normalized.split('/').filter(Boolean).pop() ?? normalized;
  const node: MemoryNode = {
    id: normalized,
    path: normalized,
    name,
    content: '',
    children: [],
  };
  parent.children.push(node);
  map.set(normalized, node);
  return node;
}

function sortTree(node: MemoryNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of node.children) {
    sortTree(child);
  }
}

function buildTreeFromDump(label: string, dump?: DumpResponse): MemoryTree {
  const root: MemoryTree = {
    id: 'root',
    path: ROOT_PATH,
    name: label,
    content: dump?.data?.[ROOT_PATH] ?? '',
    children: [],
  };

  if (!dump) {
    return root;
  }

  const nodeMap = new Map<string, MemoryNode>();

  for (const dirPath of Object.keys(dump.dirs ?? {})) {
    ensureNode(nodeMap, root, dirPath);
  }

  for (const [dataPath, content] of Object.entries(dump.data ?? {})) {
    if (dataPath === ROOT_PATH) {
      root.content = content;
      continue;
    }
    const node = ensureNode(nodeMap, root, dataPath);
    node.content = content;
  }

  sortTree(root);
  return root;
}

export function AgentsMemoryManager() {
  const queryClient = useQueryClient();

  const docsQuery = useQuery({
    queryKey: ['memory/docs'],
    queryFn: () => memoryApi.listDocs(),
    staleTime: 30_000,
  });

  const nodes = useMemo<MemoryNodeOption[]>(() => {
    const items = docsQuery.data?.items ?? [];
    return items
      .filter((item) => item.scope === 'global' || Boolean(item.threadId))
      .map((item) => ({
        key: buildNodeKey(item),
        nodeId: item.nodeId,
        scope: item.scope,
        threadId: item.threadId,
        label: buildNodeLabel(item),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [docsQuery.data]);

  const nodeByKey = useMemo(() => new Map(nodes.map((node) => [node.key, node] as const)), [nodes]);

  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);

  useEffect(() => {
    if (nodes.length === 0) {
      setSelectedNodeKey(null);
      return;
    }
    setSelectedNodeKey((previous) => (previous && nodeByKey.has(previous) ? previous : nodes[0].key));
  }, [nodeByKey, nodes]);

  const selectedNode = selectedNodeKey ? nodeByKey.get(selectedNodeKey) ?? null : null;

  const dumpKey = useMemo(
    () =>
      selectedNode
        ? (['memory/dump', selectedNode.nodeId, selectedNode.scope, selectedNode.threadId ?? null] as const)
        : null,
    [selectedNode],
  );

  const dumpQuery = useQuery<DumpResponse>({
    queryKey: dumpKey ?? ['memory/dump', 'none'],
    queryFn: async () => memoryApi.dump(selectedNode!.nodeId, selectedNode!.scope, selectedNode!.threadId) as Promise<DumpResponse>,
    enabled: Boolean(selectedNode),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const tree = useMemo<MemoryTree | null>(() => {
    if (!selectedNode) return null;
    return buildTreeFromDump(selectedNode.label, dumpQuery.data);
  }, [dumpQuery.data, selectedNode]);

  const storedPathsRef = useRef<Map<string, string>>(new Map());
  const [selectedPath, setSelectedPath] = useState<string>(ROOT_PATH);

  useEffect(() => {
    if (!selectedNode) {
      setSelectedPath(ROOT_PATH);
      return;
    }
    const stored = storedPathsRef.current.get(selectedNode.key) ?? ROOT_PATH;
    setSelectedPath(stored);
  }, [selectedNode]);

  const [editorValue, setEditorValue] = useState('');
  const [baselineValue, setBaselineValue] = useState('');
  const [docState, setDocState] = useState<DocumentState>({ loading: false, exists: false, error: null });
  const [mutationStatus, setMutationStatus] = useState<'idle' | 'pending'>('idle');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const lastLoadedRef = useRef<{ nodeKey: string; path: string } | null>(null);

  const unsaved = editorValue !== baselineValue;

  useEffect(() => {
    if (!selectedNode) {
      setEditorValue('');
      setBaselineValue('');
      setDocState({ loading: false, exists: false, error: null });
      lastLoadedRef.current = null;
      return;
    }

    const key = selectedNode.key;
    const normalizedPath = normalizePath(selectedPath);
    const last = lastLoadedRef.current;
    const pathChanged = !last || last.nodeKey !== key || last.path !== normalizedPath;

    if (normalizedPath === ROOT_PATH) {
      if (pathChanged || !unsaved) {
        setEditorValue('');
        setBaselineValue('');
      }
      setDocState({ loading: false, exists: false, error: null });
      lastLoadedRef.current = { nodeKey: key, path: normalizedPath };
      return;
    }

    if (pathChanged || !unsaved) {
      const seeded = dumpQuery.data?.data?.[normalizedPath];
      if (seeded != null) {
        setEditorValue(seeded);
        setBaselineValue(seeded);
      } else if (pathChanged) {
        setEditorValue('');
        setBaselineValue('');
      }
    }

    let cancelled = false;
    setDocState({ loading: true, exists: false, error: null });

    (async () => {
      try {
        const stat = await memoryApi.stat(selectedNode.nodeId, selectedNode.scope, selectedNode.threadId, normalizedPath);
        if (cancelled) return;
        if (!stat.exists) {
          setDocState({ loading: false, exists: false, error: null });
          lastLoadedRef.current = { nodeKey: key, path: normalizedPath };
          return;
        }
        const content = await memoryApi.read(selectedNode.nodeId, selectedNode.scope, selectedNode.threadId, normalizedPath);
        if (cancelled) return;
        setEditorValue(content);
        setBaselineValue(content);
        setDocState({ loading: false, exists: true, error: null });
        lastLoadedRef.current = { nodeKey: key, path: normalizedPath };
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load document.';
        setDocState({ loading: false, exists: false, error: message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dumpQuery.data, selectedNode, selectedPath, unsaved]);

  const handleSelectNode = useCallback((key: string) => {
    setSelectedNodeKey(key);
  }, []);

  const handleSelectPath = useCallback(
    (path: string) => {
      if (!selectedNodeKey) return;
      const normalized = normalizePath(path);
      storedPathsRef.current.set(selectedNodeKey, normalized);
      setSelectedPath(normalized);
    },
    [selectedNodeKey],
  );

  const invalidateDump = useCallback(async () => {
    if (!dumpKey) return;
    await queryClient.invalidateQueries({ queryKey: dumpKey });
    await queryClient.refetchQueries({ queryKey: dumpKey });
  }, [dumpKey, queryClient]);

  const resetDocumentCache = useCallback(() => {
    lastLoadedRef.current = null;
  }, []);

  const handleCreateDirectory = useCallback(
    async (parentPath: string, name: string) => {
      if (!selectedNode) return;
      const targetPath = joinPath(parentPath, name);
      setMutationError(null);
      setMutationStatus('pending');
      try {
        await memoryApi.ensureDir(selectedNode.nodeId, selectedNode.scope, selectedNode.threadId, targetPath);
        storedPathsRef.current.set(selectedNode.key, targetPath);
        setSelectedPath(targetPath);
        setEditorValue('');
        setBaselineValue('');
        setDocState({ loading: false, exists: false, error: null });
        resetDocumentCache();
        await invalidateDump();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create directory.';
        setMutationError(message);
      } finally {
        setMutationStatus('idle');
      }
    },
    [invalidateDump, resetDocumentCache, selectedNode],
  );

  const handleDeletePath = useCallback(
    async (path: string) => {
      if (!selectedNode) return;
      const normalized = normalizePath(path);
      const parent = getParentPath(normalized) ?? ROOT_PATH;
      setMutationError(null);
      setMutationStatus('pending');
      try {
        await memoryApi.delete(selectedNode.nodeId, selectedNode.scope, selectedNode.threadId, normalized);
        storedPathsRef.current.set(selectedNode.key, parent);
        setSelectedPath(parent);
        setEditorValue('');
        setBaselineValue('');
        setDocState({ loading: false, exists: false, error: null });
        resetDocumentCache();
        await invalidateDump();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete path.';
        setMutationError(message);
      } finally {
        setMutationStatus('idle');
      }
    },
    [invalidateDump, resetDocumentCache, selectedNode],
  );

  const handleSave = useCallback(async () => {
    if (!selectedNode) return;
    const normalized = normalizePath(selectedPath);
    if (normalized === ROOT_PATH) return;
    if (editorValue === baselineValue) return;

    setMutationError(null);
    setMutationStatus('pending');
    try {
      if (!baselineValue && editorValue) {
        await memoryApi.append(selectedNode.nodeId, selectedNode.scope, selectedNode.threadId, normalized, editorValue);
      } else {
        await memoryApi.update(selectedNode.nodeId, selectedNode.scope, selectedNode.threadId, normalized, baselineValue, editorValue);
      }
      setBaselineValue(editorValue);
      setDocState({ loading: false, exists: true, error: null });
      resetDocumentCache();
      await invalidateDump();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save document.';
      setMutationError(message);
    } finally {
      setMutationStatus('idle');
    }
  }, [baselineValue, editorValue, invalidateDump, resetDocumentCache, selectedNode, selectedPath]);

  const docsLoading = docsQuery.isLoading;
  const docsError = docsQuery.error as Error | null;
  const treeError = dumpQuery.error as Error | null;
  const treeLoading = dumpQuery.isLoading && !dumpQuery.data;

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-border/60 px-6 py-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Agents / Memory</h1>
          <p className="text-sm text-muted-foreground">Inspect and edit agent memory documents.</p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {docsLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading memory nodes…</div>
        ) : docsError ? (
          <div className="p-6 text-sm text-destructive" role="alert">
            {docsError.message ?? 'Failed to load memory nodes.'}
          </div>
        ) : nodes.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No memory nodes found.</div>
        ) : treeError ? (
          <div className="p-6 text-sm text-destructive" role="alert">
            {treeError.message ?? 'Failed to load memory tree.'}
          </div>
        ) : (
          <MemoryManager
            nodes={nodes}
            selectedNodeKey={selectedNodeKey}
            onSelectNode={handleSelectNode}
            nodeSelectDisabled={docsLoading || nodes.length === 0}
            tree={tree}
            treeLoading={Boolean(selectedNode) && treeLoading}
            disableInteractions={!selectedNode}
            selectedPath={selectedPath}
            onSelectPath={handleSelectPath}
            onCreateDirectory={handleCreateDirectory}
            onDeletePath={handleDeletePath}
            editorValue={editorValue}
            onEditorChange={setEditorValue}
            canSave={Boolean(selectedNode) && selectedPath !== ROOT_PATH && editorValue !== baselineValue && !docState.loading}
            onSave={handleSave}
            isSaving={mutationStatus === 'pending'}
            mutationError={mutationError}
            docState={docState}
            emptyTreeMessage="No documents for this node yet. Create one to get started."
            noNodesMessage="No memory nodes found."
          />
        )}
      </div>
    </div>
  );
}
