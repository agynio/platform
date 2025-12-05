import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Trash2 } from 'lucide-react';

import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { CreateDocumentDialog } from './CreateDocumentDialog';
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

type MemoryCellOption = {
  path: string;
  label: string;
};

const formatSegment = (value: string): string =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const getMemoryCellLabel = (node: MemoryNode, isRoot: boolean): string => {
  const normalizedPath = normalizePath(node.path);
  if (isRoot) {
    if (node.name && node.name.trim().length > 0 && node.name !== '/') {
      return node.name;
    }
    return 'All memory cells';
  }

  if (node.name && node.name.trim().length > 0) {
    return node.name;
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? normalizedPath;
  return formatSegment(lastSegment);
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
  const [pendingCreateParent, setPendingCreateParent] = useState<string | null>(null);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
  const selectedPathRef = useRef<string>(defaultSelectedPath);
  const [rootPath, setRootPath] = useState<string>(() => normalizePath(initialTree.path));
  const rootPathRef = useRef<string>(normalizePath(initialTree.path));
  const memoryCellLabelId = useId();

  const handleSelectPath = useCallback(
    (path: string) => {
      const normalized = normalizePath(path);
      setSelectedPath(normalized);
      onSelectPath?.(normalized);
    },
    [onSelectPath],
  );

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    rootPathRef.current = rootPath;
  }, [rootPath]);

  useEffect(() => {
    const nextTree = cloneTree(initialTree);
    setTree(nextTree);
    const currentPath = selectedPathRef.current;
    if (!pathExists(nextTree, currentPath)) {
      const preferred = normalizePath(initialSelectedPath ?? initialTree.path);
      const fallback = pathExists(nextTree, preferred) ? preferred : normalizePath(initialTree.path);
      handleSelectPath(fallback);
    }
    const currentRoot = rootPathRef.current;
    if (!pathExists(nextTree, currentRoot)) {
      const fallbackSource = pathExists(nextTree, initialTree.path) ? initialTree.path : nextTree.path;
      setRootPath(normalizePath(fallbackSource));
    }
  }, [handleSelectPath, initialSelectedPath, initialTree]);

  useEffect(() => {
    if (!initialSelectedPath) return;
    handleSelectPath(initialSelectedPath);
  }, [handleSelectPath, initialSelectedPath]);

  const selectedNode = useMemo<MemoryNode | null>(() => findNodeByPath(tree, selectedPath), [tree, selectedPath]);
  const memoryCellOptions = useMemo<MemoryCellOption[]>(() => {
    const rootOption: MemoryCellOption = {
      path: normalizePath(tree.path),
      label: getMemoryCellLabel(tree, true),
    };

    const childOptions = tree.children.map<MemoryCellOption>((child) => ({
      path: normalizePath(child.path),
      label: getMemoryCellLabel(child, false),
    }));

    return [rootOption, ...childOptions];
  }, [tree]);

  const normalizedRootPath = normalizePath(rootPath);

  useEffect(() => {
    if (memoryCellOptions.length === 0) {
      return;
    }
    if (!memoryCellOptions.some((option) => option.path === normalizedRootPath)) {
      setRootPath(memoryCellOptions[0].path);
    }
  }, [memoryCellOptions, normalizedRootPath]);

  const currentMemoryCell =
    memoryCellOptions.find((option) => option.path === normalizedRootPath) ?? memoryCellOptions[0] ?? {
      path: normalizePath(tree.path),
      label: getMemoryCellLabel(tree, true),
    };

  const displayedTree = useMemo<MemoryTree>(() => findNodeByPath(tree, normalizedRootPath) ?? tree, [normalizedRootPath, tree]);

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
    if (!pathExists(tree, normalizedRootPath)) {
      setRootPath(normalizePath(tree.path));
      return;
    }

    setExpandedPaths((previous) => {
      if (previous.has(normalizedRootPath)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(normalizedRootPath);
      return next;
    });

    const isWithinRoot = (path: string | null) => {
      if (!path) return true;
      const normalizedTarget = normalizePath(path);
      if (normalizedRootPath === '/') return true;
      return normalizedTarget === normalizedRootPath || normalizedTarget.startsWith(`${normalizedRootPath}/`);
    };

    if (!isWithinRoot(selectedPathRef.current)) {
      handleSelectPath(normalizedRootPath);
    }

    if (!isWithinRoot(pendingCreateParent)) {
      setPendingCreateParent(null);
    }

    if (!isWithinRoot(pendingDeletePath)) {
      setPendingDeletePath(null);
    }
  }, [handleSelectPath, normalizedRootPath, pendingCreateParent, pendingDeletePath, tree]);

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

  const validateCreateName = useCallback(
    (rawName: string) => {
      if (!pendingCreateParent) {
        return 'Select a parent to create a document.';
      }
      const trimmed = rawName.trim();
      if (trimmed.length === 0) {
        return 'Name is required.';
      }
      if (trimmed.includes('/')) {
        return 'Name cannot include “/”.';
      }
      const candidatePath = joinPath(pendingCreateParent, trimmed);
      if (pathExists(tree, candidatePath)) {
        return 'A document with this name already exists.';
      }
      return null;
    },
    [pendingCreateParent, tree],
  );

  const handleAddChild = useCallback((parentPath: string) => {
    setPendingCreateParent(normalizePath(parentPath));
  }, []);

  const handleCancelCreate = useCallback(() => {
    setPendingCreateParent(null);
  }, []);

  const handleConfirmCreate = useCallback(
    (name: string) => {
      if (!pendingCreateParent) return;
      const trimmedName = name.trim();
      if (validateCreateName(trimmedName)) return;

      const parentPath = normalizePath(pendingCreateParent);
      const childPath = joinPath(parentPath, trimmedName);
      const childNode: MemoryNode = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
        path: childPath,
        name: trimmedName,
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
      setPendingCreateParent(null);
      handleSelectPath(childPath);
    },
    [handleSelectPath, onTreeChange, pendingCreateParent, validateCreateName],
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

  const canDeleteSelected = selectedNode != null && selectedPath !== '/';

  return (
    <div className={cn('h-full w-full bg-white', className)}>
      <ResizablePanelGroup direction="horizontal" className="h-full min-h-[480px] overflow-hidden">
        <ResizablePanel defaultSize={32} minSize={20} className="min-w-[260px] bg-white">
          <div className="flex h-full flex-col bg-white">
            <div className="flex h-[66px] flex-col justify-center gap-1 border-b border-[var(--agyn-border-subtle)] px-6">
              <h2 className="text-sm font-semibold text-[var(--agyn-dark)]">Documents</h2>
              <p className="text-xs text-[var(--agyn-text-subtle)]">
                Viewing {currentMemoryCell.label}
              </p>
            </div>
            <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
              <VisuallyHidden id={memoryCellLabelId}>Memory cell</VisuallyHidden>
              <Select value={normalizedRootPath} onValueChange={(value) => setRootPath(normalizePath(value))}>
                <SelectTrigger
                  aria-labelledby={memoryCellLabelId}
                  aria-label="Memory cell"
                  size="default"
                  className="border-[var(--agyn-border-subtle)] bg-white text-left font-medium text-[var(--agyn-dark)]"
                >
                  <SelectValue placeholder="Select memory cell" />
                </SelectTrigger>
                <SelectContent className="min-w-[240px]">
                  {memoryCellOptions.map((option) => (
                    <SelectItem key={option.path} value={option.path}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-2 py-3">
                <TreeView
                  tree={displayedTree}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  onSelect={handleSelectPath}
                  onToggle={handleToggleExpand}
                  onAddChild={handleAddChild}
                  onDelete={handleRequestDelete}
                  showContentIndicators={showContentIndicators}
                />
              </div>
            </ScrollArea>
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
                {selectedNode ? (
                  <span
                    className={cn(
                      'text-xs font-medium',
                      unsaved ? 'text-[var(--agyn-status-pending)]' : 'text-[var(--agyn-text-subtle)]',
                    )}
                  >
                    {unsaved ? 'Unsaved changes' : 'Saved'}
                  </span>
                ) : null}
                <Button type="button" size="sm" onClick={handleSave} disabled={!unsaved || !selectedNode}>
                  Save changes
                </Button>
                {selectedNode ? (
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
                ) : null}
              </div>
            </div>
            <div className="flex-1">
              {selectedNode ? (
                <div className="h-full overflow-auto px-6 py-5">
                  <Textarea
                    value={editorValue}
                    onChange={(event) => handleEditorChange(event.target.value)}
                    aria-labelledby={editorLabelId}
                    aria-describedby={editorDescriptionId}
                    className="h-full min-h-[320px] resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed text-foreground focus-visible:ring-0"
                    placeholder="Write markdown…"
                    spellCheck="false"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
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
