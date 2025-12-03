import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { MemoryTree } from '@/components/memory/MemoryTree';
import { MarkdownInput } from '@/components/MarkdownInput';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { memoryQueryKeys, useMemoryData } from '@/components/memory/MemoryDataProvider';
import { notifyError, notifySuccess } from '@/lib/notify';
import { joinMemoryPath, memoryPathParent, normalizeMemoryPath } from '@/components/memory/path';

interface MemoryExplorerScreenProps {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  initialPath?: string;
  className?: string;
  onPathChange?: (nextPath: string) => void;
  onThreadChange?: (threadId: string) => void;
}

export default function MemoryExplorerScreen({
  nodeId,
  scope,
  threadId,
  initialPath,
  className = '',
  onPathChange,
  onThreadChange,
}: MemoryExplorerScreenProps) {
  const queryClient = useQueryClient();
  const memoryData = useMemoryData();

  const requiresThread = scope === 'perThread';
  const trimmedThreadId = threadId?.trim() ?? '';
  const effectiveThreadId = requiresThread ? (trimmedThreadId.length > 0 ? trimmedThreadId : undefined) : threadId;
  const threadMissing = requiresThread && !effectiveThreadId;

  const [selectedPath, setSelectedPath] = useState(() => normalizeMemoryPath(initialPath ?? '/'));
  const selectedPathRef = useRef(selectedPath);
  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  const lastSyncedRef = useRef<{ path: string; content: string } | null>(null);

  const documentStateRef = useRef<{ exists: boolean }>({ exists: false });

  const [editorValue, setEditorValue] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const resetEditor = useCallback(() => {
    setEditorValue('');
    setEditorDirty(false);
  }, []);

  const editorValueRef = useRef('');
  useEffect(() => {
    editorValueRef.current = editorValue;
  }, [editorValue]);

  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const childInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!isAddingChild) return;
    setNewChildName('');
    const timer = setTimeout(() => {
      childInputRef.current?.focus();
    }, 10);
    return () => clearTimeout(timer);
  }, [isAddingChild]);

  const focusPath = useCallback(
    (path: string, options: { notify?: boolean } = {}) => {
      const normalized = normalizeMemoryPath(path);
      const shouldNotify = options.notify ?? true;
      if (normalized === selectedPathRef.current) {
        if (shouldNotify) {
          onPathChange?.(normalized);
        }
        return;
      }

      selectedPathRef.current = normalized;
      setSelectedPath(normalized);
      lastSyncedRef.current = null;
      documentStateRef.current.exists = false;
      resetEditor();
      setIsAddingChild(false);
      setNewChildName('');
      if (shouldNotify) {
        onPathChange?.(normalized);
      }
    },
    [onPathChange, resetEditor],
  );

  useEffect(() => {
    const next = normalizeMemoryPath(initialPath ?? '/');
    focusPath(next, { notify: false });
  }, [initialPath, nodeId, scope, effectiveThreadId, focusPath]);

  useEffect(() => {
    if (threadMissing) {
      focusPath('/', { notify: false });
    }
  }, [threadMissing, focusPath]);

  const [threadInput, setThreadInput] = useState(threadId ?? '');
  useEffect(() => {
    setThreadInput(threadId ?? '');
  }, [threadId]);

  const statQuery = useQuery({
    queryKey: memoryQueryKeys.stat(nodeId, scope, effectiveThreadId, selectedPath),
    queryFn: () => memoryData.stat(nodeId, scope, effectiveThreadId, selectedPath),
    enabled: !threadMissing,
    staleTime: 15_000,
  });

  const readQuery = useQuery({
    queryKey: memoryQueryKeys.read(nodeId, scope, effectiveThreadId, selectedPath),
    queryFn: () => memoryData.read(nodeId, scope, effectiveThreadId, selectedPath),
    enabled: !threadMissing,
    retry: false,
  });

  useEffect(() => {
    if (threadMissing) {
      lastSyncedRef.current = null;
      resetEditor();
      return;
    }

    if (readQuery.data) {
      const incoming = readQuery.data.content;
      const prev = lastSyncedRef.current;
      const path = selectedPathRef.current;
      const hasPathChanged = !prev || prev.path !== path;
      if (!editorDirty || hasPathChanged) {
        setEditorValue(incoming);
        setEditorDirty(false);
      }
      lastSyncedRef.current = { path, content: incoming };
      documentStateRef.current.exists = true;
    } else if (readQuery.isError) {
      const path = selectedPathRef.current;
      lastSyncedRef.current = { path, content: '' };
      if (!editorDirty) {
        resetEditor();
      }
      documentStateRef.current.exists = false;
    }
  }, [editorDirty, readQuery.data, readQuery.isError, threadMissing, resetEditor]);

  const invalidateTree = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: memoryQueryKeys.listScope(nodeId, scope, effectiveThreadId) });
  }, [effectiveThreadId, nodeId, queryClient, scope]);

  const invalidatePathQueries = useCallback(
    (targetPath: string, options?: { includeRead?: boolean }) => {
      const normalized = normalizeMemoryPath(targetPath);
      queryClient.invalidateQueries({ queryKey: memoryQueryKeys.stat(nodeId, scope, effectiveThreadId, normalized) });
      if (options?.includeRead ?? true) {
        queryClient.invalidateQueries({
          queryKey: memoryQueryKeys.read(nodeId, scope, effectiveThreadId, normalized),
        });
      }
    },
    [effectiveThreadId, nodeId, queryClient, scope],
  );

  const invalidateParentQueries = useCallback(
    (childPath: string) => {
      const normalizedChild = normalizeMemoryPath(childPath);
      const parentPath = memoryPathParent(normalizedChild);
      queryClient.invalidateQueries({
        queryKey: memoryQueryKeys.stat(nodeId, scope, effectiveThreadId, parentPath),
      });
      const parentReadKey = memoryQueryKeys.read(nodeId, scope, effectiveThreadId, parentPath);
      if (queryClient.getQueryState(parentReadKey)) {
        queryClient.invalidateQueries({ queryKey: parentReadKey });
      }
    },
    [effectiveThreadId, nodeId, queryClient, scope],
  );
  const documentExists = statQuery.data?.exists ?? false;
  const documentHasSubdocs = statQuery.data?.hasSubdocs ?? false;
  const documentLength = statQuery.data?.contentLength ?? 0;

  useEffect(() => {
    documentStateRef.current.exists = documentExists;
  }, [documentExists]);

  const documentStatus = useMemo(() => {
    if (threadMissing) return 'Thread required';
    if (statQuery.isLoading) return 'Loading path…';
    if (statQuery.error) return 'Failed to load path info';
    if (!documentExists) return 'Document missing';
    if (documentHasSubdocs && documentLength > 0) return 'Document with subdocuments';
    if (documentHasSubdocs) return 'Has subdocuments';
    return 'Document';
  }, [documentExists, documentHasSubdocs, documentLength, statQuery.error, statQuery.isLoading, threadMissing]);

  const readBusy = readQuery.isLoading || readQuery.isFetching;
  const isRootPath = selectedPathRef.current === '/';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const path = normalizeMemoryPath(selectedPathRef.current);
      const nextContent = editorValueRef.current;
      const lastSynced = lastSyncedRef.current?.content ?? '';
      const exists = documentStateRef.current.exists;

      if (!exists) {
        await memoryData.ensureDir(nodeId, scope, effectiveThreadId, path);
        if (nextContent.length > 0) {
          await memoryData.append(nodeId, scope, effectiveThreadId, path, nextContent);
        }
        return { status: 'created' as const };
      }

      if (nextContent === lastSynced) {
        return { status: 'unchanged' as const };
      }

      if (lastSynced.length === 0) {
        await memoryData.ensureDir(nodeId, scope, effectiveThreadId, path);
        await memoryData.append(nodeId, scope, effectiveThreadId, path, nextContent);
        return { status: 'saved' as const };
      }

      const result = await memoryData.update(nodeId, scope, effectiveThreadId, path, lastSynced, nextContent);
      if (result.replaced === 0 && nextContent !== lastSynced) {
        throw new Error('Document changed remotely. Refresh and try again.');
      }
      return { status: 'saved' as const };
    },
    onSuccess: (outcome) => {
      if (outcome.status === 'created') {
        notifySuccess('Document created');
      } else if (outcome.status === 'saved') {
        notifySuccess('Document saved');
      }
      const currentPath = selectedPathRef.current;
      documentStateRef.current.exists = true;
      lastSyncedRef.current = { path: currentPath, content: editorValueRef.current };
      setEditorDirty(false);
      invalidateTree();
      invalidatePathQueries(currentPath);
      invalidateParentQueries(currentPath);
    },
    onError: (error: unknown) => {
      notifyError((error as Error)?.message || 'Failed to save document');
    },
  });

  const createChildMutation = useMutation({
    mutationFn: async (targetPath: string) => {
      const normalized = normalizeMemoryPath(targetPath);
      await memoryData.ensureDir(nodeId, scope, effectiveThreadId, normalized);
      return normalized;
    },
    onSuccess: (normalized) => {
      notifySuccess('Subdocument added');
      invalidateTree();
      invalidateParentQueries(normalized);
      invalidatePathQueries(normalized, { includeRead: false });
      focusPath(normalized, { notify: true });
    },
    onError: (error: unknown) => {
      notifyError((error as Error)?.message || 'Failed to add subdocument');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetPath: string) => {
      const normalized = normalizeMemoryPath(targetPath);
      return memoryData.delete(nodeId, scope, effectiveThreadId, normalized);
    },
    onSuccess: (_result, removedPath) => {
      const normalized = normalizeMemoryPath(removedPath);
      notifySuccess('Document removed');
      invalidateTree();
      invalidatePathQueries(normalized);
      invalidateParentQueries(normalized);
      const parent = memoryPathParent(normalized);
      focusPath(parent, { notify: true });
    },
    onError: (error: unknown) => {
      notifyError((error as Error)?.message || 'Failed to delete document');
    },
  });

  const saveDisabled = threadMissing || saveMutation.isPending || readBusy || !editorDirty;
  const addDisabled = threadMissing || createChildMutation.isPending;
  const addConfirmDisabled = threadMissing || createChildMutation.isPending || newChildName.trim().length === 0;
  const deleteDisabled = threadMissing || isRootPath || deleteMutation.isPending || !documentExists;

  const handleEditorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    editorValueRef.current = nextValue;
    setEditorValue(nextValue);
    setEditorDirty(true);
  };

  const handleSave = () => {
    if (saveDisabled) return;
    saveMutation.mutate();
  };

  const handleAddChildSubmit = () => {
    if (addConfirmDisabled) return;
    const trimmedName = newChildName.trim();
    if (!trimmedName) return;
    const targetPath = joinMemoryPath(selectedPathRef.current, trimmedName);
    createChildMutation.mutate(targetPath);
  };

  const handleAddChildKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddChildSubmit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (!createChildMutation.isPending) {
        setIsAddingChild(false);
        setNewChildName('');
      }
    }
  };

  const handleDelete = () => {
    if (deleteDisabled) return;
    deleteMutation.mutate(selectedPathRef.current);
  };

  const handleThreadSubmit = useCallback(() => {
    if (!onThreadChange) return;
    onThreadChange(threadInput.trim());
  }, [onThreadChange, threadInput]);

  const handleThreadKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleThreadSubmit();
    }
  };

  const refetchPath = () => {
    statQuery.refetch();
    readQuery.refetch();
  };

  const renderThreadSelector = () => {
    if (scope !== 'perThread') return null;

    return (
      <div className="mt-4 space-y-2">
        <div className="text-sm font-medium text-[var(--agyn-dark)]">Thread</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={threadInput}
            onChange={(event) => setThreadInput(event.target.value)}
            onKeyDown={handleThreadKeyDown}
            placeholder="Enter thread ID"
            className="w-full max-w-sm"
            disabled={!onThreadChange}
          />
          {onThreadChange ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleThreadSubmit}
              disabled={threadInput.trim() === trimmedThreadId && !!trimmedThreadId}
            >
              Apply
            </Button>
          ) : null}
        </div>
        {threadMissing ? (
          <div className="text-xs text-[var(--agyn-status-failed)]">
            Select a thread to enable memory operations.
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`flex h-full flex-col bg-white ${className}`}>
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Memory Explorer</h1>
              <Badge variant={scope === 'global' ? 'primary' : 'accent'} size="sm">
                {scope === 'global' ? 'Global scope' : 'Per-thread scope'}
              </Badge>
            </div>
            <div className="text-sm text-[var(--agyn-text-subtle)] break-all">{selectedPathRef.current}</div>
            <div className="text-xs text-[var(--agyn-text-subtle)]">{documentStatus}</div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              icon={<RefreshCw className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              onClick={refetchPath}
              disabled={threadMissing}
              title="Refresh current path"
              aria-label="Refresh current path"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                handleSave();
              }}
              disabled={saveDisabled}
            >
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
        {renderThreadSelector()}
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        <ResizablePanel defaultSize={28} minSize={20} className="border-r border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
          <div className="flex h-full flex-col">
            <div className="border-b border-[var(--agyn-border-subtle)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--agyn-dark)]">Memory tree</h2>
              <p className="text-xs text-[var(--agyn-text-subtle)]">Browse memory locations</p>
            </div>
            {threadMissing ? (
              <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-[var(--agyn-text-subtle)]">
                Select a thread to browse per-thread memories.
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <MemoryTree
                  nodeId={nodeId}
                  scope={scope}
                  threadId={effectiveThreadId}
                  selectedPath={selectedPath}
                  onSelectPath={(path) => focusPath(path)}
                  className="bg-white"
                />
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={72} minSize={40} className="bg-white">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {threadMissing ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-[var(--agyn-text-subtle)]">
                  Choose a thread to edit per-thread memory content.
                </div>
            ) : (
                <div className="flex h-full flex-col gap-6">
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <h2 className="text-lg font-semibold text-[var(--agyn-dark)]">Document</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button type="button" variant="primary" size="sm" onClick={handleSave} disabled={saveDisabled}>
                          <Save className="mr-2 h-4 w-4" />
                          Save
                        </Button>
                        {isAddingChild ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              ref={childInputRef}
                              value={newChildName}
                              onChange={(event) => setNewChildName(event.target.value)}
                              onKeyDown={handleAddChildKeyDown}
                              placeholder="Child name"
                              className="h-8 w-44"
                              disabled={createChildMutation.isPending}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={handleAddChildSubmit}
                              disabled={addConfirmDisabled}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (createChildMutation.isPending) return;
                                setIsAddingChild(false);
                                setNewChildName('');
                              }}
                              disabled={createChildMutation.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsAddingChild(true)}
                            disabled={addDisabled}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add subdocument
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="danger" size="sm" disabled={deleteDisabled}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete “{selectedPathRef.current}”?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the document and all nested entries. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-[var(--agyn-status-failed)] text-white hover:bg-[var(--agyn-status-failed)]/90"
                                onClick={handleDelete}
                                disabled={deleteMutation.isPending}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <MarkdownInput
                      value={editorValue}
                      onChange={handleEditorChange}
                      disabled={threadMissing || readBusy}
                      className="min-h-[360px]"
                      helperText={readQuery.error ? (readQuery.error as Error).message : undefined}
                    />
                    {isRootPath ? (
                      <div className="text-xs text-[var(--agyn-text-subtle)]">The root document cannot be deleted.</div>
                    ) : null}
                  </section>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
