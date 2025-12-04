import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChevronRight, FileText, Plus, Trash2 } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
} from '../ui/sidebar';

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
      const indicatorIcon = showContentIndicators ? (
        <FileText className="size-4 text-sidebar-foreground/70" aria-hidden="true" />
      ) : null;

      return (
        <SidebarMenuItem key={node.path} role="none" className="group/menu-item">
          <div
            className={cn(
              'flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors',
              'focus-within:outline-none focus-within:ring-2 focus-within:ring-sidebar-ring focus-within:bg-sidebar-accent/70',
              isSelected
                ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
            data-selected={isSelected ? 'true' : undefined}
          >
            {isExpandable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  isSelected ? 'text-sidebar-accent-foreground' : 'text-muted-foreground',
                )}
                aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(node.path);
                }}
                tabIndex={-1}
              >
                <ChevronRight className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-90')} />
              </Button>
            ) : (
              <span className="inline-flex size-8 shrink-0" aria-hidden="true" />
            )}
            <button
              ref={registerRef(node.path)}
              type="button"
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={isSelected ? 'true' : 'false'}
              aria-expanded={isExpandable ? isExpanded : undefined}
              className={cn(
                'flex flex-1 items-center gap-2 overflow-hidden rounded-md px-1.5 py-0.5 text-left outline-none ring-sidebar-ring transition-colors',
                'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                isSelected
                  ? 'text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:text-sidebar-accent-foreground',
              )}
              onClick={() => onSelect(node.path)}
              onKeyDown={(event) => handleKeyDown(event, node.path)}
              tabIndex={isSelected ? 0 : -1}
            >
              {indicatorIcon ? (
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-md border border-sidebar-border/60 bg-sidebar text-muted-foreground transition-colors',
                    'group-hover/menu-item:border-sidebar-accent/40 group-hover/menu-item:bg-sidebar-accent/30',
                    isSelected && 'border-sidebar-accent bg-sidebar-accent/30 text-sidebar-accent-foreground',
                  )}
                  aria-hidden="true"
                >
                  {indicatorIcon}
                </span>
              ) : null}
              <span
                className={cn(
                  'truncate text-sm font-medium transition-colors',
                  isSelected ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground',
                )}
                title={node.path}
              >
                {node.name}
              </span>
            </button>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                      isSelected && 'text-sidebar-accent-foreground',
                    )}
                    aria-label="Add subdocument"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddChild(node.path);
                    }}
                    tabIndex={-1}
                  >
                    <Plus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Add subdocument</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-40',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      node.path === '/' ? 'text-muted-foreground' : 'text-destructive',
                    )}
                    aria-label={`Delete ${node.path}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(node.path);
                    }}
                    disabled={node.path === '/'}
                    tabIndex={-1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete document</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {isExpandable && isExpanded && node.children.length > 0 && (
            <SidebarMenuSub role="group" className="gap-1">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </SidebarMenuSub>
          )}
        </SidebarMenuItem>
      );
    },
    [expandedPaths, handleKeyDown, onAddChild, onDelete, onSelect, onToggle, registerRef, selectedPath, showContentIndicators],
  );

  return (
    <SidebarMenu role="tree" className={className}>
      {renderNode(tree, 0)}
    </SidebarMenu>
  );
}
