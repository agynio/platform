import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '../ui/scroll-area';

import { Panel, PanelBody, PanelHeader } from '../Panel';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { MarkdownEditor } from './MarkdownEditor';
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

  const handleAddChild = useCallback(
    (parentPath: string) => {
      const proposed = window.prompt('Enter a name for the new memory node');
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
        hasDocument: false,
        content: '',
        children: [],
      };

      setTree((previous) => {
        const next = addChild(previous, parentPath, childNode);
        onTreeChange?.(next);
        return next;
      });
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

  return (
    <div className={cn('h-full w-full', className)}>
      <ResizablePanelGroup direction="horizontal" className="h-full min-h-[480px] rounded-lg border border-border bg-muted/40">
        <ResizablePanel defaultSize={30} minSize={20} className="min-w-[240px]">
          <Panel className="flex h-full flex-col">
            <PanelHeader className="border-b border-border bg-background">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">Memory Tree</h2>
                <p className="text-xs text-muted-foreground">Manage paths and documents</p>
              </div>
            </PanelHeader>
            <PanelBody className="flex-1 space-y-3 p-0">
              <ScrollArea className="h-full p-3">
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
              {treeMessage && (
                <div className="px-3 pb-4 text-xs text-destructive" role="alert">
                  {treeMessage}
                </div>
              )}
            </PanelBody>
          </Panel>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70} minSize={40}>
          <Panel className="flex h-full flex-col">
            <PanelHeader className="border-b border-border bg-background">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">Markdown</h2>
                <p className="text-xs text-muted-foreground">{selectedPath}</p>
              </div>
            </PanelHeader>
            <PanelBody className="flex-1 p-4">
              {selectedNode ? (
                <MarkdownEditor
                  value={editorValue}
                  onChange={handleEditorChange}
                  onSave={handleSave}
                  unsaved={unsaved}
                  className="h-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
                  Select a node to edit its markdown content.
                </div>
              )}
            </PanelBody>
          </Panel>
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
