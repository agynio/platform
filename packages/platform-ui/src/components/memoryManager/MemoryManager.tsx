import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '../Button';
import { ScrollArea } from '../ui/scroll-area';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { TreeView } from './TreeView';
import { cn } from '@/lib/utils';
import {
  type MemoryTree,
  type MemoryNode,
  addChild,
  cloneTree,
  deleteNode,
  findNodeByPath,
  getAncestorPaths,
  getParentPath,
  joinPath,
  normalizePath,
  pathExists,
  updateNodeContent,
} from './utils';

type MemoryManagerProps = {
  initialTree: MemoryTree;
  className?: string;
  onTreeChange?: (tree: MemoryTree) => void;
  onSelectPath?: (path: string) => void;
  onEditorChange?: (value: string) => void;
  initialSelectedPath?: string;
  showContentIndicators?: boolean;
};

export function MemoryManager({
  initialTree,
  className,
  onTreeChange,
  onSelectPath,
  onEditorChange,
  initialSelectedPath,
  showContentIndicators = true,
}: MemoryManagerProps) {
  const defaultSelectedPath = normalizePath(initialSelectedPath ?? initialTree.path);
  const [tree, setTree] = useState<MemoryTree>(() => cloneTree(initialTree));
  const [selectedPath, setSelectedPath] = useState<string>(defaultSelectedPath);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(getAncestorPaths(defaultSelectedPath)));
  const [editorValue, setEditorValue] = useState<string>(() => findNodeByPath(initialTree, defaultSelectedPath)?.content ?? '');
  const [unsaved, setUnsaved] = useState(false);
  const [treeMessage, setTreeMessage] = useState<string | null>(null);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
  const selectedPathRef = useRef<string>(defaultSelectedPath);

  const handleSelectPath = useCallback(
    (path: string) => {
      const normalized = normalizePath(path);
      setSelectedPath(normalized);
      onSelectPath?.(normalized);
      setTreeMessage(null);
    },
    [onSelectPath],
  );

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    const nextTree = cloneTree(initialTree);
    setTree(nextTree);
    const currentPath = selectedPathRef.current;
    if (!pathExists(nextTree, currentPath)) {
      const preferred = normalizePath(initialSelectedPath ?? initialTree.path);
      const fallback = pathExists(nextTree, preferred) ? preferred : normalizePath(initialTree.path);
      handleSelectPath(fallback);
    }
  }, [handleSelectPath, initialSelectedPath, initialTree]);

  useEffect(() => {
    if (!initialSelectedPath) return;
    handleSelectPath(initialSelectedPath);
  }, [handleSelectPath, initialSelectedPath]);

  const selectedNode = useMemo<MemoryNode | null>(() => findNodeByPath(tree, selectedPath), [tree, selectedPath]);

  useEffect(() => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      let changed = false;
      for (const ancestor of getAncestorPaths(selectedPath)) {
        if (!next.has(ancestor)) {
          next.add(ancestor);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [selectedPath]);

  useEffect(() => {
    const nextContent = selectedNode?.content ?? '';
    setEditorValue(nextContent);
    setUnsaved(false);
    onEditorChange?.(nextContent);
  }, [onEditorChange, selectedNode, selectedPath]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const createDocument = useCallback(
    (parentPath: string) => {
      const proposed = window.prompt('Enter a name for the new document');
      if (proposed == null) return;
      const name = proposed.trim();
      if (name.length === 0) {
        setTreeMessage('Name cannot be empty.');
        return;
      }
      if (name.includes('/')) {
        setTreeMessage('Name cannot include “/”.');
        return;
      }

      const childPath = joinPath(parentPath, name);
      if (pathExists(tree, childPath)) {
        setTreeMessage(`Path ${childPath} already exists.`);
        return;
      }

      const childNode: MemoryNode = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
        path: childPath,
        name,
        content: '',
        children: [],
      };

      setTree((previous) => {
        const next = addChild(previous, parentPath, childNode);
        onTreeChange?.(next);
        return next;
      });
      setTreeMessage(null);
      setExpandedPaths((previous) => {
        const next = new Set(previous);
        for (const ancestor of getAncestorPaths(childPath)) {
          next.add(ancestor);
        }
        return next;
      });
      handleSelectPath(childPath);
    },
    [handleSelectPath, onTreeChange, tree],
  );

  const handleAddChild = useCallback((parentPath: string) => {
    createDocument(parentPath);
  }, [createDocument]);

  const handleRequestDelete = useCallback((path: string) => {
    if (path === '/') return;
    setPendingDeletePath(path);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeletePath) return;
    const target = pendingDeletePath;
    setPendingDeletePath(null);
    setTree((previous) => {
      const next = deleteNode(previous, target);
      onTreeChange?.(next);
      return next;
    });
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      for (const value of Array.from(next)) {
        if (value === target || value.startsWith(`${target}/`)) {
          next.delete(value);
        }
      }
      return next;
    });
    const parent = getParentPath(target) ?? '/';
    handleSelectPath(parent);
  }, [handleSelectPath, onTreeChange, pendingDeletePath]);

  const handleEditorChange = useCallback(
    (value: string) => {
      setEditorValue(value);
      const baseline = selectedNode?.content ?? '';
      setUnsaved(value !== baseline);
      onEditorChange?.(value);
    },
    [onEditorChange, selectedNode],
  );

  const handleSave = useCallback(() => {
    if (!selectedNode) return;
    setTree((previous) => {
      const next = updateNodeContent(previous, selectedPath, editorValue);
      onTreeChange?.(next);
      return next;
    });
    setUnsaved(false);
  }, [editorValue, onTreeChange, selectedNode, selectedPath]);

  const editorLabelId = useId();
  const editorDescriptionId = useId();

  useEffect(() => {
    if (!selectedNode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (unsaved) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, selectedNode, unsaved]);

  return (
    <div className={cn('h-full w-full', className)}>
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full min-h-[480px] overflow-hidden rounded-[12px] border border-[var(--agyn-border-subtle)] bg-white"
      >
        <ResizablePanel
          defaultSize={32}
          minSize={20}
          className="min-w-[260px] border-r border-[var(--agyn-border-subtle)] bg-white text-[var(--agyn-dark)]"
        >
          <div className="flex h-full flex-col gap-4 px-4 py-5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--agyn-dark)]">Documents</h2>
              <p className="mt-1 text-xs text-[var(--agyn-gray)]">Select a document to edit</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <TreeView
                  tree={tree}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  onSelect={handleSelectPath}
                  onToggle={handleToggleExpand}
                  onAddChild={handleAddChild}
                  onDelete={handleRequestDelete}
                  showContentIndicators={showContentIndicators}
                />
              </ScrollArea>
            </div>
            {treeMessage && (
              <div
                className="rounded-[8px] border border-[var(--agyn-status-failed)]/40 bg-[var(--agyn-status-failed)]/10 px-3 py-2 text-xs text-[var(--agyn-status-failed)]"
                role="alert"
              >
                {treeMessage}
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-[var(--agyn-border-subtle)]" />
        <ResizablePanel defaultSize={68} minSize={40} className="bg-white">
          <div className="flex h-full flex-col">
            <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 id={editorLabelId} className="text-sm font-semibold text-[var(--agyn-dark)]">
                    Document content
                  </h2>
                  <p id={editorDescriptionId} className="truncate text-xs text-[var(--agyn-gray)]">
                    {selectedPath}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {selectedNode ? (
                    <span
                      className={cn(
                        'text-xs font-medium',
                        unsaved
                          ? 'text-[var(--agyn-status-pending)]'
                          : 'text-[var(--agyn-gray)]',
                      )}
                    >
                      {unsaved ? 'Unsaved changes' : 'Saved'}
                    </span>
                  ) : null}
                  <Button type="button" size="sm" onClick={handleSave} disabled={!unsaved || !selectedNode}>
                    Save changes
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex-1">
              {selectedNode ? (
                <div className="h-full overflow-auto px-6 py-5">
                  <textarea
                    value={editorValue}
                    onChange={(event) => handleEditorChange(event.target.value)}
                    aria-labelledby={editorLabelId}
                    aria-describedby={editorDescriptionId}
                    className="h-full min-h-[320px] w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--agyn-dark)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--agyn-blue)]"
                    placeholder="Write markdown…"
                    spellCheck="false"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[var(--agyn-gray)]">
                  <p>Select a document to edit its content.</p>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <ConfirmDeleteDialog
        open={pendingDeletePath != null}
        path={pendingDeletePath}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeletePath(null)}
      />
    </div>
  );
}
