import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ThreadStatusFilter } from './ThreadStatusFilterSwitch';
import { threads } from '@/api/modules/threads';
import type { ThreadNode } from '@/api/types/agents';
import { normalizeAgentName } from '@/utils/agentDisplay';

export function ThreadTreeNode({
  node,
  statusFilter,
  level,
  onSelect,
  selectedId,
  invalidateSiblingCache,
  onSelectedNodeChange,
}: {
  node: ThreadNode;
  statusFilter: ThreadStatusFilter;
  level: number;
  onSelect: (node: ThreadNode) => void;
  selectedId?: string;
  invalidateSiblingCache?: () => void;
  onSelectedNodeChange?: (node: ThreadNode) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<ThreadNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const summary = node.summary && node.summary.trim().length > 0 ? node.summary.trim() : '(no summary yet)';
  const agentLabel = normalizeAgentName(node.agentName) ?? '(unknown agent)';
  const isSelected = selectedId === node.id;
  const activity = node.metrics?.activity ?? 'idle';
  const createdAtLabel = new Date(node.createdAt).toLocaleString();
  const isRoot = node.parentId == null;
  const showFooter = isRoot;
  const childrenGroupId = `thread-children-${node.id}`;

  useEffect(() => {
    if (isSelected) onSelectedNodeChange?.(node);
  }, [isSelected, node, onSelectedNodeChange]);

  async function loadChildren() {
    setLoading(true);
    setError(null);
    try {
      const res = await threads.children(node.id, statusFilter);
      setChildren(res.items || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load children';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus() {
    setToggling(true);
    setError(null);
    try {
      const next = (node.status || 'open') === 'open' ? 'closed' : 'open';
      await threads.patchStatus(node.id, next);
      // status updated server-side; refresh UI via refetches below
      // Refresh children list if visible to apply filter
      if (expanded) await loadChildren();
      // Allow parent to refresh roots if provided
      invalidateSiblingCache?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update status';
      setError(msg);
    } finally {
      setToggling(false);
    }
  }

  const rowClasses = `${
    isSelected
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
  } group rounded-md px-2 py-1.5 text-sm transition-colors`;
  const summaryClasses = `${
    isSelected
      ? 'text-sidebar-accent-foreground'
      : 'text-foreground group-hover:text-sidebar-accent-foreground'
  } thread-summary min-w-0 overflow-hidden text-sm font-medium leading-tight`;
  const metaClasses = `${
    isSelected ? 'text-sidebar-accent-foreground/80' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'
  } mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs`;
  const toggleButtonClasses = `${
    isSelected
      ? 'text-sidebar-accent-foreground'
      : 'text-muted-foreground hover:text-sidebar-accent-foreground'
  } flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50`;
  const toggleIconClasses = `h-4 w-4 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`;

  return (
    <li role="treeitem" aria-expanded={expanded} aria-selected={isSelected} aria-level={level + 1} className="select-none">
      <div className={rowClasses}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="flex flex-1 flex-col items-start text-left" onClick={() => onSelect(node)}>
            <div className={summaryClasses} title={summary}>
              {summary}
            </div>
            <div className={metaClasses}>
              <span className="max-w-[200px] truncate" title={agentLabel}>{agentLabel}</span>
              <span aria-hidden="true">•</span>
              <span>{createdAtLabel}</span>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${activity === 'working' ? 'bg-blue-500' : activity === 'waiting' ? 'bg-yellow-500' : 'bg-green-500'}`}
              aria-label={`Activity: ${activity}`}
              title={`Activity: ${activity}`}
            />
            <button
              type="button"
              className={toggleButtonClasses}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              aria-controls={expanded ? childrenGroupId : undefined}
              onClick={async () => {
                const next = !expanded;
                setExpanded(next);
                if (next && children == null) await loadChildren();
              }}
            >
              <ChevronDown className={toggleIconClasses} />
            </button>
          </div>
        </div>
        {showFooter && (
          <div className="mt-2 flex w-full justify-end">
            <button
              className="rounded border px-2 py-1 text-xs"
              onClick={toggleStatus}
              disabled={toggling}
              aria-busy={toggling}
              aria-label={(node.status || 'open') === 'open' ? 'Close thread' : 'Reopen thread'}
            >
              {(node.status || 'open') === 'open' ? 'Close' : 'Reopen'}
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <ul
          id={childrenGroupId}
          role="group"
          className="ml-6 mt-1 space-y-1 border-l pl-2"
          aria-busy={loading}
        >
          {loading && <li className="text-xs text-muted-foreground">Loading…</li>}
          {error && <li className="text-xs text-destructive" role="alert">{error}</li>}
          {!loading && !error && children && children.length === 0 && (
            <li className="text-xs text-muted-foreground">No children</li>
          )}
          {!loading && !error && (children || []).map((c) => (
            <ThreadTreeNode
              key={c.id}
              node={c}
              statusFilter={statusFilter}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onSelectedNodeChange={onSelectedNodeChange}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
