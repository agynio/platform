import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ThreadStatusFilter } from './ThreadStatusFilterSwitch';
import { ThreadTreeNode, type ThreadNode } from './ThreadTreeNode';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3010';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}/api/${path}`, { headers: { 'Content-Type': 'application/json' }, ...(init || {}) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export function ThreadTree({ status, onSelect, selectedId }: { status: ThreadStatusFilter; onSelect: (id: string) => void; selectedId?: string }) {
  const qc = useQueryClient();
  const rootsQ = useQuery<{ items: ThreadNode[] }, Error>({
    queryKey: ['agents', 'threads', 'roots', status],
    queryFn: async () => api<{ items: ThreadNode[] }>(`agents/threads?rootsOnly=true&status=${status}&limit=100`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agents', 'threads', 'roots', status] });

  return (
    <div>
      {rootsQ.isLoading && <div className="text-sm text-gray-500 mt-2">Loading…</div>}
      {rootsQ.error && (
        <div className="text-sm text-red-600 mt-2" role="alert">{rootsQ.error.message}</div>
      )}
      <ul role="tree" className="mt-2 space-y-1">
        {(rootsQ.data?.items || []).map((t) => (
          <ThreadTreeNode key={t.id} node={t} statusFilter={status} level={0} onSelect={onSelect} selectedId={selectedId} invalidateSiblingCache={invalidate} />
        ))}
        {rootsQ.data?.items?.length === 0 && !rootsQ.isLoading && (
          <li className="text-sm text-gray-500">No threads</li>
        )}
      </ul>
    </div>
  );
}

