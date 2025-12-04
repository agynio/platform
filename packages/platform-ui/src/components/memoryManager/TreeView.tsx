import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChevronRight, FileText, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { IconButton } from '../IconButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
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
        <FileText className="h-4 w-4" aria-hidden="true" />
      ) : null;
      const indent = depth * INDENT_STEP;

      return (
        <li key={node.path} role="none" className="space-y-1">
          <div
            className={cn(
              'group flex min-h-10 items-center gap-2 rounded-[10px] border border-transparent bg-white/0 py-2 transition-colors',
              isSelected
                ? 'border-[var(--agyn-blue)] bg-[var(--agyn-blue)]/5 shadow-[0_0_0_1px_rgba(28,72,154,0.08)]'
                : 'hover:border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)]',
            )}
            style={{ marginLeft: indent }}
            data-selected={isSelected ? 'true' : undefined}
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
                className={cn(
                  'shrink-0 text-[var(--agyn-gray)] hover:text-[var(--agyn-blue)]',
                  isSelected && 'text-[var(--agyn-blue)]',
                )}
                icon={<ChevronRight className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-90')} />}
              />
            ) : (
              <span className="h-8 w-8 shrink-0" aria-hidden="true" />
            )}
            <button
              ref={registerRef(node.path)}
              type="button"
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={isSelected ? 'true' : 'false'}
              aria-expanded={isExpandable ? isExpanded : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 py-1 text-left text-sm font-medium text-[var(--agyn-dark)] transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--agyn-blue)] focus-visible:outline-offset-1',
                isSelected
                  ? 'text-[var(--agyn-blue)]'
                  : 'group-hover:text-[var(--agyn-blue)]',
              )}
              onClick={() => onSelect(node.path)}
              onKeyDown={(event) => handleKeyDown(event, node.path)}
              tabIndex={isSelected ? 0 : -1}
            >
              {indicatorIcon ? (
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-[8px] border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] text-[var(--agyn-gray)] transition-colors',
                    isSelected && 'border-[var(--agyn-blue)] bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]',
                  )}
                  aria-hidden="true"
                >
                  {indicatorIcon}
                </span>
              ) : null}
              <span className="truncate" title={node.path}>
                {node.name}
              </span>
            </button>
            <div className="flex items-center gap-1">
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
                    className={cn(
                      'text-[var(--agyn-gray)] hover:text-[var(--agyn-blue)]',
                      isSelected && 'text-[var(--agyn-blue)]',
                    )}
                    icon={<Plus className="h-4 w-4" />}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">Add subdocument</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant={node.path === '/' ? 'ghost' : 'danger'}
                    size="sm"
                    tabIndex={-1}
                    aria-label={`Delete ${node.path}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(node.path);
                    }}
                    disabled={node.path === '/'}
                    className={cn(
                      node.path === '/'
                        ? 'text-[var(--agyn-gray)]'
                        : 'text-[var(--agyn-status-failed)] hover:text-[var(--agyn-status-failed)]',
                    )}
                    icon={<Trash2 className="h-4 w-4" />}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">Delete document</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {isExpandable && isExpanded && node.children.length > 0 ? (
            <ul role="group" className="space-y-1">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          ) : null}
        </li>
      );
    },
    [expandedPaths, handleKeyDown, onAddChild, onDelete, onSelect, onToggle, registerRef, selectedPath, showContentIndicators],
  );

  return (
    <ul role="tree" className={cn('flex flex-col gap-1', className)}>
      {renderNode(tree, 0)}
    </ul>
  );
}
