import { useMemo } from 'react';

import { Button } from '../Button';
import { ToolItem } from '../ToolItem';

import type { McpToolDescriptor } from './types';

interface ToolsListProps {
  tools: McpToolDescriptor[];
  loading: boolean;
  updatedAt?: string;
  onDiscover?: () => void;
}

export function ToolsList({ tools, loading, updatedAt, onDiscover }: ToolsListProps) {
  const updatedLabel = useMemo(() => {
    if (!updatedAt) return null;
    const parsed = new Date(updatedAt);
    if (Number.isNaN(parsed.getTime())) return updatedAt;
    return parsed.toLocaleString();
  }, [updatedAt]);

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[var(--agyn-dark)] font-semibold">Tools</h3>
          {updatedLabel && (
            <p className="text-xs text-[var(--agyn-gray)]">Last updated {updatedLabel}</p>
          )}
        </div>
        {onDiscover && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscover}
            disabled={loading}
            className="shrink-0"
          >
            {loading ? 'Discovering…' : 'Discover tools'}
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {loading && <div className="text-xs text-[var(--agyn-gray)]">Discovering tools…</div>}
        {!loading && tools.length === 0 && (
          <div className="text-xs text-[var(--agyn-gray)]">No tools discovered</div>
        )}
        {tools.map((tool) => {
          const displayName = tool.title && tool.title.trim().length > 0 ? tool.title : tool.name;
          const description = tool.description ?? '';
          return (
            <ToolItem
              key={tool.name}
              name={displayName}
              description={description}
            />
          );
        })}
      </div>
    </section>
  );
}
