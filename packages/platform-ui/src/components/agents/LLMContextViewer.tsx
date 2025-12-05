import { useEffect, useMemo, useRef } from 'react';
import { Badge } from '@/components/Badge';
import { useContextItems } from '@/api/hooks/contextItems';
import type { ContextItem } from '@/api/types/agents';

type LLMContextViewerProps = {
  ids: readonly string[];
  highlightLastCount?: number;
  onItemsRendered?: (items: ContextItem[]) => void;
  onBeforeLoadMore?: () => void;
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size % 1 === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function toPlainText(content: ContextItem['contentText'], fallback: ContextItem['contentJson']): string {
  if (typeof content === 'string' && content.trim().length > 0) return content;
  if (fallback === null || fallback === undefined) return '';
  try {
    return JSON.stringify(fallback, null, 2);
  } catch (_err) {
    return String(fallback);
  }
}

const ROLE_COLORS: Record<ContextItem['role'], string> = {
  system: 'bg-gray-900 text-white',
  user: 'bg-emerald-600 text-white',
  assistant: 'bg-sky-600 text-white',
  tool: 'bg-amber-600 text-white',
  memory: 'bg-purple-600 text-white',
  summary: 'bg-indigo-600 text-white',
  other: 'bg-gray-500 text-white',
};

const HIGHLIGHT_ROLES: ReadonlySet<ContextItem['role']> = new Set(['user', 'assistant', 'tool']);

export function LLMContextViewer({ ids, highlightLastCount, onItemsRendered, onBeforeLoadMore }: LLMContextViewerProps) {
  const { items, hasMore, isInitialLoading, isFetching, error, loadMore, total, targetCount } = useContextItems(ids, {
    initialCount: 10,
  });

  const emptyState = ids.length === 0;
  const displayedCount = useMemo(() => Math.min(targetCount, total), [targetCount, total]);
  const highlightCount = useMemo(() => {
    if (!highlightLastCount || !Number.isFinite(highlightLastCount)) return 0;
    return Math.max(0, Math.floor(highlightLastCount));
  }, [highlightLastCount]);
  const highlightSet = useMemo(() => {
    if (highlightCount <= 0 || items.length === 0) return new Set<string>();
    const collected = new Set<string>();
    let remaining = highlightCount;
    for (let index = items.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const candidate = items[index];
      if (!candidate) continue;
      if (!HIGHLIGHT_ROLES.has(candidate.role)) continue;
      if (typeof candidate.id === 'string' && candidate.id.length > 0) {
        collected.add(candidate.id);
        remaining -= 1;
      }
    }
    return collected;
  }, [items, highlightCount]);
  const renderedCallbackRef = useRef<((items: ContextItem[]) => void) | undefined>(undefined);

  renderedCallbackRef.current = onItemsRendered;

  useEffect(() => {
    renderedCallbackRef.current?.(items);
  }, [items]);

  if (emptyState) {
    return <div className="text-[11px] text-gray-500">No context items</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {hasMore && (
        <button
          type="button"
          className="self-start rounded border border-gray-300 bg-white px-3 py-1 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            onBeforeLoadMore?.();
            loadMore();
          }}
          disabled={isFetching}
        >
          Load older context ({displayedCount} of {total})
        </button>
      )}

      {items.map((item) => {
        const textContent = toPlainText(item.contentText, item.contentJson);
        const roleColor = ROLE_COLORS[item.role] ?? 'bg-gray-900 text-white';
        const isHighlighted = highlightSet.has(item.id);
        const wrapperClasses = ['space-y-2 text-[11px] text-gray-800'];
        if (isHighlighted) {
          wrapperClasses.push('rounded-md border border-sky-200 bg-sky-50/80 px-3 py-2');
        }
        return (
          <div
            key={item.id}
            data-context-item-id={item.id}
            data-context-item-role={item.role}
            className={wrapperClasses.join(' ')}
          >
            <header className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              <Badge className={`px-2 py-0.5 text-[10px] font-semibold capitalize leading-tight ${roleColor}`}>{item.role}</Badge>
              <span className="normal-case text-gray-600">{new Date(item.createdAt).toLocaleString()}</span>
              <span className="normal-case text-gray-500">{formatBytes(item.sizeBytes)}</span>
              {isHighlighted && (
                <Badge variant="outline" className="border-sky-300 bg-transparent text-[10px] font-semibold uppercase text-sky-700">
                  New
                </Badge>
              )}
            </header>
            {textContent ? <div className="content-wrap text-gray-800">{textContent}</div> : null}
          </div>
        );
      })}

      {isInitialLoading && <div className="text-[11px] text-gray-500">Loading context…</div>}
      {!!error && !isInitialLoading && <div className="text-[11px] text-red-600">Failed to load context items</div>}
      {isFetching && !isInitialLoading && <div className="text-[11px] text-gray-500">Loading…</div>}
      {!error && !isFetching && !isInitialLoading && items.length === 0 && displayedCount > 0 && (
        <div className="text-[11px] text-gray-500">No context items available.</div>
      )}
    </div>
  );
}
