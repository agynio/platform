import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '../../Button';
import { IconButton } from '../../IconButton';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../ui/resizable';
import { ScrollArea } from '../../ui/scroll-area';
import { Textarea } from '../../ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { CreateDocumentDialog } from './CreateDocumentDialog';
import { TreeView } from './TreeView';
import { cn } from '@/lib/utils';
import { Dropdown } from '@/components/Dropdown';
import {
  type MemoryTree,
  cloneTree,
  getAncestorPaths,
  getParentPath,
  joinPath,
  normalizePath,
  pathExists,
} from './utils';

const ROOT_PATH = '/' as const;

type MemoryNodeOption = {
  key: string;
  label: string;
};

type DocumentState = {
  loading: boolean;
  exists: boolean;
  error: string | null;
};

type MemoryManagerProps = {
  nodes: MemoryNodeOption[];
  selectedNodeKey: string | null;
  onSelectNode: (key: string) => void;
  nodeSelectDisabled?: boolean;
  tree: MemoryTree | null;
  treeLoading?: boolean;
  disableInteractions?: boolean;
  selectedPath: string;
  onSelectPath: (path: string) => void;
  onCreateDirectory: (parentPath: string, name: string) => void;
  onDeletePath: (path: string) => void;
  editorValue: string;
  onEditorChange: (value: string) => void;
  canSave: boolean;
  onSave: () => void;
  isSaving?: boolean;
  mutationError?: string | null;
  docState: DocumentState;
  showContentIndicators?: boolean;
  emptyTreeMessage?: string;
  noNodesMessage?: string;
  className?: string;
};

function pathSetWithAncestors(source: Set<string>, path: string): Set<string> {
  const next = new Set(source);
  for (const ancestor of getAncestorPaths(path)) {
    next.add(ancestor);
  }
  return next;
}

export function MemoryManager({
  nodes,
  selectedNodeKey,
  onSelectNode,
  nodeSelectDisabled = false,
  tree,
  treeLoading = false,
  disableInteractions = false,
  selectedPath,
  onSelectPath,
  onCreateDirectory,
  onDeletePath,
  editorValue,
  onEditorChange,
  canSave,
  onSave,
  isSaving = false,
  mutationError,
  docState,
  showContentIndicators = true,
  emptyTreeMessage,
  noNodesMessage,
  className,
}: MemoryManagerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([ROOT_PATH]));
  const [pendingCreateParent, setPendingCreateParent] = useState<string | null>(null);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);

  const treeSnapshot = useMemo(() => (tree ? cloneTree(tree) : null), [tree]);

  useEffect(() => {
    setExpandedPaths((previous) => pathSetWithAncestors(previous, selectedPath));
  }, [selectedPath]);

  useEffect(() => {
    if (!treeSnapshot) {
      setExpandedPaths(new Set([ROOT_PATH]));
      return;
    }
    setExpandedPaths((previous) => {
      const next = new Set<string>();
      for (const value of previous) {
        if (value === ROOT_PATH || pathExists(treeSnapshot, value)) {
          next.add(value);
        }
      }
      if (!next.has(ROOT_PATH)) next.add(ROOT_PATH);
      return next;
    });
  }, [treeSnapshot]);

  const treeIsEmpty = !treeSnapshot || treeSnapshot.children.length === 0;
  const interactionsDisabled = disableInteractions || !selectedNodeKey || !treeSnapshot;

  const editorLabelId = useId();
  const editorDescriptionId = useId();

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

  const handleSelectNode = useCallback(
    (value: string) => {
      if (nodeSelectDisabled) return;
      onSelectNode(value);
    },
    [nodeSelectDisabled, onSelectNode],
  );

  const handleSelectTreePath = useCallback(
    (path: string) => {
      if (interactionsDisabled) return;
      onSelectPath(normalizePath(path));
    },
    [interactionsDisabled, onSelectPath],
  );

  const handleAddChild = useCallback(
    (parentPath: string) => {
      if (interactionsDisabled) return;
      setPendingCreateParent(normalizePath(parentPath));
    },
    [interactionsDisabled],
  );

  const handleCancelCreate = useCallback(() => {
    setPendingCreateParent(null);
  }, []);

  const validateCreateName = useCallback(
    (rawName: string) => {
      if (!pendingCreateParent) return 'Select a parent to create a document.';
      const trimmed = rawName.trim();
      if (trimmed.length === 0) return 'Name is required.';
      if (trimmed.includes('/')) return 'Name cannot include “/”.';
      if (!treeSnapshot) return null;
      const candidatePath = joinPath(pendingCreateParent, trimmed);
      if (pathExists(treeSnapshot, candidatePath)) return 'A document with this name already exists.';
      return null;
    },
    [pendingCreateParent, treeSnapshot],
  );

  const handleConfirmCreate = useCallback(
    (name: string) => {
      if (!pendingCreateParent || interactionsDisabled) return;
      const trimmed = name.trim();
      if (validateCreateName(trimmed)) return;
      const parentPath = normalizePath(pendingCreateParent);
      const childPath = joinPath(parentPath, trimmed);
      onCreateDirectory(parentPath, trimmed);
      setPendingCreateParent(null);
      setExpandedPaths((previous) => pathSetWithAncestors(previous, childPath));
      onSelectPath(childPath);
    },
    [interactionsDisabled, onCreateDirectory, onSelectPath, pendingCreateParent, validateCreateName],
  );

  const handleRequestDelete = useCallback(
    (path: string) => {
      if (interactionsDisabled) return;
      const normalized = normalizePath(path);
      if (normalized === ROOT_PATH) return;
      setPendingDeletePath(normalized);
    },
    [interactionsDisabled],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeletePath || interactionsDisabled) return;
    const target = pendingDeletePath;
    setPendingDeletePath(null);
    onDeletePath(target);
    const parent = getParentPath(target) ?? ROOT_PATH;
    onSelectPath(parent);
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      next.delete(target);
      return next;
    });
  }, [interactionsDisabled, onDeletePath, onSelectPath, pendingDeletePath]);

  const handleEditorInput = useCallback(
    (value: string) => {
      if (interactionsDisabled) return;
      onEditorChange(value);
    },
    [interactionsDisabled, onEditorChange],
  );

  const handleSave = useCallback(() => {
    if (interactionsDisabled || !canSave) return;
    onSave();
  }, [canSave, interactionsDisabled, onSave]);

  const canDeleteSelected = !interactionsDisabled && selectedPath !== ROOT_PATH && !docState.loading;

  const renderTreeSection = () => {
    if (!nodes.length) {
      return (
        <div className="flex flex-1 min-h-0 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          <p>{noNodesMessage ?? 'No memory nodes found.'}</p>
        </div>
      );
    }

    if (treeLoading) {
      return (
        <div className="flex flex-1 min-h-0 items-center justify-center px-6 text-sm text-muted-foreground">Loading documents…</div>
      );
    }

    if (!treeSnapshot || treeIsEmpty) {
      return (
        <div className="flex flex-1 min-h-0 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          <p>{emptyTreeMessage ?? 'No documents yet. Create one to get started.'}</p>
        </div>
      );
    }

    return (
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 py-3">
          <TreeView
            tree={treeSnapshot}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelect={handleSelectTreePath}
            onToggle={handleToggleExpand}
            onAddChild={handleAddChild}
            onDelete={handleRequestDelete}
            showContentIndicators={showContentIndicators}
          />
        </div>
      </ScrollArea>
    );
  };

  const renderEditorBody = () => {
    if (!selectedNodeKey) {
      return <p>Select a memory node to continue.</p>;
    }

    if (docState.error) {
      return (
        <p role="alert" className="text-sm text-destructive">
          {docState.error}
        </p>
      );
    }

    if (selectedPath === ROOT_PATH) {
      return <p>{treeIsEmpty ? 'Select or create a document.' : 'Select a document from the tree to view its contents.'}</p>;
    }

    if (docState.loading) {
      return <p>Loading document…</p>;
    }

    return null;
  };

  const editorMessage = renderEditorBody();
  const showTextarea = !editorMessage && !docState.loading && selectedNodeKey && !interactionsDisabled && selectedPath !== ROOT_PATH;

  return (
    <div className={cn('h-full w-full bg-white', className)}>
      <ResizablePanelGroup direction="horizontal" className="h-full min-h-[480px] overflow-hidden">
        <ResizablePanel defaultSize={32} minSize={20} className="min-w-[260px] bg-white">
          <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex h-[66px] items-center border-b border-[var(--agyn-border-subtle)] px-6">
              <Dropdown
                placeholder="Select memory node"
                value={selectedNodeKey ?? ''}
                onValueChange={handleSelectNode}
                options={nodes.map((option) => ({ value: option.key, label: option.label }))}
                size="default"
                disabled={nodeSelectDisabled || !nodes.length}
                className="w-full"
              />
            </div>
            {renderTreeSection()}
          </div>
        </ResizablePanel>
        <ResizableHandle
          withHandle={false}
          className="relative w-px bg-[var(--agyn-border-subtle)] after:w-6 after:-translate-x-1/2 after:bg-transparent data-[panel-group-direction=horizontal]:cursor-col-resize"
        />
        <ResizablePanel defaultSize={68} minSize={40} className="bg-white">
          <div className="flex h-full flex-col bg-white">
            <div className="flex h-[66px] items-center justify-between border-b border-[var(--agyn-border-subtle)] bg-white px-6">
              <div className="min-w-0">
                <h2 id={editorLabelId} className="text-sm font-semibold text-[var(--agyn-dark)]">
                  Document content
                </h2>
                <p id={editorDescriptionId} className="truncate text-xs text-[var(--agyn-text-subtle)]">
                  {selectedPath}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleSave}
                  disabled={!canSave || interactionsDisabled || selectedPath === ROOT_PATH || docState.loading}
                >
                  Save changes
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      icon={<Trash2 className="size-4" />}
                      variant="danger"
                      size="sm"
                      onClick={() => handleRequestDelete(selectedPath)}
                      disabled={!canDeleteSelected}
                      aria-label="Delete document"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end">
                    Delete document
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="relative flex-1">
              <div className="h-full overflow-auto px-6 py-5">
                {editorMessage ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    {editorMessage}
                  </div>
                ) : (
                  <>
                    {!docState.exists ? (
                      <div className="mb-3 rounded-md border border-dashed border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                        Document not found. Create a directory from the tree or enter content and save to initialize it.
                      </div>
                    ) : null}
                    <Textarea
                      value={editorValue}
                      onChange={(event) => handleEditorInput(event.target.value)}
                      aria-labelledby={editorLabelId}
                      aria-describedby={editorDescriptionId}
                      className="h-full min-h-[320px] resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed text-foreground focus-visible:ring-0"
                      placeholder="Write markdown…"
                      spellCheck="false"
                      disabled={!showTextarea}
                    />
                  </>
                )}
              </div>
              {mutationError ? (
                <div className="pointer-events-auto absolute left-1/2 top-4 z-20 w-[min(480px,90%)] -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive shadow-sm">
                  {mutationError}
                </div>
              ) : null}
              {isSaving ? (
                <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-muted/80 px-4 py-1 text-xs text-muted-foreground">
                  Saving changes…
                </div>
              ) : null}
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
      <CreateDocumentDialog
        open={pendingCreateParent != null}
        parentPath={pendingCreateParent}
        onCancel={handleCancelCreate}
        onCreate={handleConfirmCreate}
        validateName={validateCreateName}
      />
    </div>
  );
}
