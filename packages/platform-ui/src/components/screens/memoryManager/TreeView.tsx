import { useCallback, useEffect, useMemo, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/IconButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

const INDENT_STEP = 20;

export function TreeView({
  tree,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
  showContentIndicators: _showContentIndicators = true,
  className,
}: TreeViewProps) {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
    (path: string) => (element: HTMLDivElement | null) => {
      if (element) {
        itemRefs.current.set(path, element);
      } else {
        itemRefs.current.delete(path);
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, currentPath: string) => {
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
      const paddingStart = depth * INDENT_STEP + 12;

      return (
        <li key={node.path} role="none" className="space-y-1">
          <div className="relative">
            <div
              ref={registerRef(node.path)}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={isSelected ? 'true' : 'false'}
              aria-expanded={isExpandable ? isExpanded : undefined}
              tabIndex={isSelected ? 0 : -1}
              className={cn(
                'group/tree-item flex min-h-10 min-w-0 w-full items-center gap-2 rounded-md pr-10 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isSelected
                  ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]'
                  : 'text-[var(--sidebar-foreground)]/80 hover:bg-[var(--sidebar-accent)]/70 hover:text-[var(--sidebar-accent-foreground)]',
              )}
              style={{ paddingInlineStart: `${paddingStart}px` }}
              data-selected={isSelected ? 'true' : undefined}
              onClick={() => onSelect(node.path)}
              onKeyDown={(event) => handleKeyDown(event, node.path)}
            >
              {isExpandable ? (
                <IconButton
                  variant="ghost"
                  size="sm"
                  tabIndex={-1}
                  aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(node.path);
                  }}
                  icon={<ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} />}
                  className={cn(
                    'shrink-0 rounded-md text-[var(--sidebar-foreground)]/60 hover:bg-[var(--sidebar-accent)]/40 hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isSelected && 'text-[var(--sidebar-accent-foreground)]',
                  )}
                />
              ) : (
                <span className="h-8 w-8 shrink-0" aria-hidden="true" />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate" aria-label={node.name}>
                    {node.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  {node.name}
                </TooltipContent>
              </Tooltip>
            </div>
            <div
              className={cn(
                'absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 transition-opacity',
                'pointer-events-none opacity-0 group-hover/tree-item:opacity-100 group-hover/tree-item:pointer-events-auto group-focus-visible/tree-item:opacity-100 group-focus-visible/tree-item:pointer-events-auto',
                isSelected && 'opacity-100 pointer-events-auto',
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    tabIndex={-1}
                    aria-label="Add subdocument"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddChild(node.path);
                    }}
                    icon={<Plus className="size-4" />}
                    className={cn(
                      'rounded-md text-[var(--sidebar-foreground)]/60 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isSelected && 'text-[var(--sidebar-accent-foreground)]',
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">Add subdocument</TooltipContent>
              </Tooltip>
              {node.path !== '/' ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      tabIndex={-1}
                      aria-label="Delete document"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(node.path);
                      }}
                      icon={<Trash2 className="size-4" />}
                      className={cn(
                        'rounded-md text-[var(--sidebar-foreground)]/60 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isSelected && 'text-[var(--sidebar-accent-foreground)]',
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">Delete document</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
          {isExpandable && isExpanded && node.children.length > 0 ? (
            <ul role="group" className="ml-0 flex flex-col gap-1 pl-0">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          ) : null}
        </li>
      );
    },
    [expandedPaths, handleKeyDown, onAddChild, onDelete, onSelect, onToggle, registerRef, selectedPath],
  );

  return (
    <ul role="tree" className={cn('flex flex-col gap-1', className)}>
      {renderNode(tree, 0)}
    </ul>
  );
}
