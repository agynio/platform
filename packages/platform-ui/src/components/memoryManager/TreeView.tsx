import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import Badge from '../Badge';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  Plus,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  type MemoryTree,
  type MemoryNode,
  getParentPath,
} from './utils';

type TreeViewProps = {
  tree: MemoryTree;
  selectedPath: string;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onAddChild: (path: string) => void;
  onDelete: (path: string) => void;
  showContentIndicators?: boolean;
  className?: string;
};

type VisibleNode = {
  node: MemoryNode;
  depth: number;
  isExpanded: boolean;
};

export function TreeView({
  tree,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
  showContentIndicators = true,
  className,
}: TreeViewProps) {
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const visibleNodes = useMemo<VisibleNode[]>(() => {
    const nodes: VisibleNode[] = [];
    const traverse = (current: MemoryNode, depth: number) => {
      const isExpanded = expandedPaths.has(current.path);
      nodes.push({ node: current, depth, isExpanded });
      if (current.children.length === 0) return;
      if (!isExpanded) return;
      for (const child of current.children) {
        traverse(child, depth + 1);
      }
    };
    traverse(tree, 0);
    return nodes;
  }, [tree, expandedPaths]);

  useEffect(() => {
    const ref = itemRefs.current.get(selectedPath);
    if (ref) ref.focus();
  }, [selectedPath]);

  const registerRef = useCallback(
    (path: string) => (element: HTMLButtonElement | null) => {
      if (element) {
        itemRefs.current.set(path, element);
      } else {
        itemRefs.current.delete(path);
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentPath: string) => {
      const index = visibleNodes.findIndex((entry) => entry.node.path === currentPath);
      if (index === -1) return;
      const { node, depth, isExpanded } = visibleNodes[index];

      switch (event.key) {
        case 'ArrowDown': {
          const next = visibleNodes[index + 1];
          if (next) {
            event.preventDefault();
            onSelect(next.node.path);
          }
          break;
        }
        case 'ArrowUp': {
          const prev = visibleNodes[index - 1];
          if (prev) {
            event.preventDefault();
            onSelect(prev.node.path);
          }
          break;
        }
        case 'ArrowRight': {
          if (node.children.length > 0) {
            if (!isExpanded) {
              event.preventDefault();
              onToggle(node.path);
            } else {
              const next = visibleNodes[index + 1];
              if (next && next.depth === depth + 1) {
                event.preventDefault();
                onSelect(next.node.path);
              }
            }
          }
          break;
        }
        case 'ArrowLeft': {
          if (node.children.length > 0 && isExpanded) {
            event.preventDefault();
            onToggle(node.path);
            break;
          }
          const parentPath = getParentPath(node.path);
          if (parentPath) {
            event.preventDefault();
            onSelect(parentPath);
          }
          break;
        }
        case 'Enter':
        case ' ':
        case 'Spacebar': {
          event.preventDefault();
          onSelect(node.path);
          break;
        }
        case 'Delete':
        case 'Backspace': {
          if (node.path !== '/') {
            event.preventDefault();
            onDelete(node.path);
          }
          break;
        }
        default: {
          if (event.key.toLowerCase() === 'a') {
            event.preventDefault();
            onAddChild(node.path);
          }
          break;
        }
      }
    },
    [visibleNodes, onSelect, onToggle, onAddChild, onDelete],
  );

  const renderNode = useCallback(
    (node: MemoryNode, depth: number): ReactNode => {
      const isSelected = selectedPath === node.path;
      const isExpandable = node.children.length > 0;
      const isExpanded = expandedPaths.has(node.path);
      const indent = depth * 16;
      const indicatorIcon = node.hasDocument ? (
        <FileText className="size-4 text-primary" aria-hidden="true" />
      ) : (
        <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
      );

      return (
        <li key={node.path} role="none">
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors focus-within:bg-accent focus-within:text-accent-foreground',
              isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60 hover:text-accent-foreground',
            )}
            style={{ paddingLeft: indent }}
          >
            {isExpandable ? (
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/40"
                aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(node.path);
                }}
                tabIndex={-1}
              >
                {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : (
              <span className="w-7" aria-hidden="true" />
            )}
            <button
              ref={registerRef(node.path)}
              type="button"
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={isSelected}
              aria-expanded={isExpandable ? isExpanded : undefined}
              className="flex flex-1 items-center gap-2 text-left focus-visible:outline-none"
              onClick={() => onSelect(node.path)}
              onKeyDown={(event) => handleKeyDown(event, node.path)}
              tabIndex={isSelected ? 0 : -1}
            >
              {showContentIndicators && indicatorIcon}
              <span className="truncate" title={node.path}>
                {node.name}
              </span>
            </button>
            <div className="flex items-center gap-1">
              {node.hasDocument && showContentIndicators && (
                <Badge variant="accent" className="text-[10px] uppercase tracking-wide">
                  doc
                </Badge>
              )}
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/40"
                aria-label={`Add child to ${node.path}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAddChild(node.path);
                }}
                tabIndex={-1}
              >
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/40 disabled:opacity-40"
                aria-label={`Delete ${node.path}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(node.path);
                }}
                disabled={node.path === '/'}
                tabIndex={-1}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          {isExpandable && isExpanded && node.children.length > 0 && (
            <ul role="group" className="space-y-1">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    },
    [expandedPaths, handleKeyDown, onAddChild, onDelete, onSelect, onToggle, registerRef, selectedPath, showContentIndicators],
  );

  return (
    <ul className={cn('space-y-1', className)} role="tree">
      {renderNode(tree, 0)}
    </ul>
  );
}
