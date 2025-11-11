import { useState } from 'react';
import type { ThreadStatusFilter } from './ThreadStatusFilterSwitch';
import { threads } from '@/api/modules/threads';
import type { ThreadNode } from '@/api/types/agents';

export function ThreadTreeNode({
  node,
  statusFilter,
  level,
  onSelect,
  selectedId,
  invalidateSiblingCache,
}: {
  node: ThreadNode;
  statusFilter: ThreadStatusFilter;
  level: number;
  onSelect: (id: string) => void;
  selectedId?: string;
  invalidateSiblingCache?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<ThreadNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const summary = node.summary && node.summary.trim().length > 0 ? node.summary.trim() : '(no summary yet)';
  const agentTitle = node.agentTitle && node.agentTitle.trim().length > 0 ? node.agentTitle.trim() : '(unknown agent)';
  const isSelected = selectedId === node.id;
  const remindersCount = node.metrics?.remindersCount ?? 0;
  const activity = node.metrics?.activity ?? 'idle';
  const runsCount = node.metrics?.runsCount ?? 0;
  const statusLabel = (node.status || 'open') === 'open' ? 'Open' : 'Closed';
  const createdAtLabel = new Date(node.createdAt).toLocaleString();

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

  const padding = 8 + level * 12;

  return (
    <li role="treeitem" aria-expanded={expanded} aria-selected={isSelected} aria-level={level + 1} className="select-none">
      <div className={`flex items-center gap-2 rounded px-2 py-1 ${isSelected ? 'bg-gray-200' : 'hover:bg-gray-100'}`} style={{ paddingLeft: padding }}>
        <button
          className="text-xs text-gray-600"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={async () => {
            const next = !expanded;
            setExpanded(next);
            if (next && children == null) await loadChildren();
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <button className="flex-1 text-left" onClick={() => onSelect(node.id)}>
          <div
            className="thread-summary min-w-0 overflow-hidden text-sm font-medium leading-tight text-gray-900"
            title={summary}
          >
            {summary}
          </div>
          <div className="mt-0.5 text-xs text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="truncate max-w-[200px]" title={agentTitle}>{agentTitle}</span>
            <span aria-hidden="true">•</span>
            <span>{statusLabel}</span>
            <span aria-hidden="true">•</span>
            <span>created {createdAtLabel}</span>
          </div>
        </button>
        {/* Activity indicator: small colored dot with tooltip + aria */}
        <span
          className={`inline-block w-2 h-2 rounded-full ${activity === 'working' ? 'bg-green-500' : activity === 'waiting' ? 'bg-yellow-500' : 'bg-blue-500'}`}
          aria-label={`Activity: ${activity}`}
          title={`Activity: ${activity}`}
        />
        {runsCount > 0 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-700" aria-label={`Total runs: ${runsCount}`} title={`Total runs: ${runsCount}`}>
            Runs {runsCount}
          </span>
        )}
        {/* Reminders badge: show clock + count when > 0 */}
        {remindersCount > 0 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-700" aria-label={`Active reminders: ${remindersCount}`} title={`Active reminders: ${remindersCount}`}>
            🕒 {remindersCount}
          </span>
        )}
        <button className="text-xs border rounded px-2 py-0.5" onClick={toggleStatus} disabled={toggling} aria-busy={toggling} aria-label={(node.status || 'open') === 'open' ? 'Close thread' : 'Reopen thread'}>
          {(node.status || 'open') === 'open' ? 'Close' : 'Reopen'}
        </button>
      </div>
      {expanded && (
        <ul role="group" className="mt-1" aria-busy={loading}>
          {loading && <li className="text-xs text-gray-500" style={{ paddingLeft: padding + 16 }}>Loading…</li>}
          {error && <li className="text-xs text-red-600" role="alert" style={{ paddingLeft: padding + 16 }}>{error}</li>}
          {!loading && !error && children && children.length === 0 && (
            <li className="text-xs text-gray-500" style={{ paddingLeft: padding + 16 }}>No children</li>
          )}
          {!loading && !error && (children || []).map((c) => (
            <ThreadTreeNode key={c.id} node={c} statusFilter={statusFilter} level={level + 1} onSelect={onSelect} selectedId={selectedId} />
          ))}
        </ul>
      )}
    </li>
  );
}
