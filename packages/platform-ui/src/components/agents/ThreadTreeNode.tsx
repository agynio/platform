import React, { useState } from 'react';
import type { ThreadStatusFilter } from './ThreadStatusFilterSwitch';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3010';

export type ThreadNode = {
  id: string;
  alias: string;
  summary?: string | null;
  status?: 'open' | 'closed';
  parentId?: string | null;
  createdAt: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path.startsWith('/api') ? '' : '/api/'}${path}`, { headers: { 'Content-Type': 'application/json' }, ...(init || {}) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

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

  const label = (node.summary && node.summary.trim().length > 0) ? node.summary : '(no summary yet)';
  const isSelected = selectedId === node.id;

  async function loadChildren() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: ThreadNode[] }>(`agents/threads/${node.id}/children?status=${statusFilter}`);
      setChildren(res.items);
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
      await api(`/agents/threads/${node.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
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
          <div className="text-sm">{label}</div>
          <div className="text-xs text-gray-500">{(node.status || 'open') === 'open' ? 'Open' : 'Closed'} • created {new Date(node.createdAt).toLocaleString()}</div>
        </button>
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
