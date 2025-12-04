import { useCallback, useEffect, useMemo, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronRight, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar';
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
        <SidebarMenuItem key={node.path} role="none">
          <SidebarMenuButton
            asChild
            isActive={isSelected}
            size="lg"
            className="group/menu-button relative w-full pr-10"
          >
            <div
              ref={registerRef(node.path)}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={isSelected ? 'true' : 'false'}
              aria-expanded={isExpandable ? isExpanded : undefined}
              tabIndex={isSelected ? 0 : -1}
              className={cn(
                'flex min-h-10 w-full items-center gap-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isSelected ? 'font-semibold text-sidebar-accent-foreground' : 'font-medium text-sidebar-foreground/80',
              )}
              style={{ paddingInlineStart: `${paddingStart}px` }}
              data-selected={isSelected ? 'true' : undefined}
              onClick={() => onSelect(node.path)}
              onKeyDown={(event) => handleKeyDown(event, node.path)}
            >
              {isExpandable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  tabIndex={-1}
                  aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(node.path);
                  }}
                  className={cn(
                    'shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground',
                    isSelected && 'text-sidebar-accent-foreground',
                  )}
                >
                  <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} />
                </Button>
              ) : (
                <span className="size-8 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate" title={node.path}>
                {node.name}
              </span>
            </div>
          </SidebarMenuButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuAction
                type="button"
                aria-label="Add subdocument"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddChild(node.path);
                }}
                className={cn(
                  'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isSelected && 'text-sidebar-accent-foreground',
                )}
              >
                <Plus className="size-4" />
              </SidebarMenuAction>
            </TooltipTrigger>
            <TooltipContent side="top">Add subdocument</TooltipContent>
          </Tooltip>
          {isExpandable && isExpanded && node.children.length > 0 ? (
            <SidebarMenu role="group" className="gap-1 pl-0">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </SidebarMenu>
          ) : null}
        </SidebarMenuItem>
      );
    },
    [expandedPaths, handleKeyDown, onAddChild, onSelect, onToggle, registerRef, selectedPath],
  );

  return (
    <SidebarMenu role="tree" className={cn('gap-1', className)}>
      {renderNode(tree, 0)}
    </SidebarMenu>
  );
}
