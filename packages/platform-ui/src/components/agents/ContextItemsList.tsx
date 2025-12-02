import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@agyn/ui';
import { useContextItems } from '@/api/hooks/contextItems';
import type { ContextItem, ContextItemRole } from '@/api/types/agents';

type ContextItemsListProps = {
  ids: readonly string[];
  highlightLastCount?: number;
  initialVisibleCount?: number;
  pageSize?: number;
  allowedRoles?: readonly ContextItemRole[] | ReadonlySet<ContextItemRole>;
  loadMoreLabel?: string;
  emptyLabel?: string;
  onItemsRendered?: (items: ContextItem[]) => void;
  onBeforeLoadMore?: () => void;
};

const ROLE_COLORS: Record<ContextItemRole, string> = {
  system: 'bg-gray-900 text-white',
  user: 'bg-emerald-600 text-white',
  assistant: 'bg-sky-600 text-white',
  tool: 'bg-amber-600 text-white',
  memory: 'bg-purple-600 text-white',
  summary: 'bg-indigo-600 text-white',
  other: 'bg-gray-500 text-white',
};

const DEFAULT_PAGE_SIZE = 20;
const MIN_INITIAL_WINDOW = 10;

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

function normalizeAllowedRoles(allowedRoles: ContextItemsListProps['allowedRoles']): ReadonlySet<ContextItemRole> | null {
  if (!allowedRoles) return null;
  if (allowedRoles instanceof Set) return allowedRoles;
  return new Set(allowedRoles);
}

export function ContextItemsList({
  ids,
  highlightLastCount,
  initialVisibleCount,
  pageSize,
  allowedRoles,
  loadMoreLabel,
  emptyLabel,
  onItemsRendered,
  onBeforeLoadMore,
}: ContextItemsListProps) {
  const allowedRolesSet = useMemo(() => normalizeAllowedRoles(allowedRoles), [allowedRoles]);
  const baseVisibleCount = Math.max(0, initialVisibleCount ?? 0);
  const pageSizeValue = Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE);
  const initialWindowSize = Math.max(MIN_INITIAL_WINDOW, pageSizeValue, baseVisibleCount);
  const { items, total, hasMore, isInitialLoading, isFetching, error, loadMore } = useContextItems(ids, {
    initialCount: initialWindowSize,
    pageSize: pageSizeValue,
  });

  const idsKey = useMemo(() => ids.join('|'), [ids]);
  const [extraPages, setExtraPages] = useState(0);

  useEffect(() => {
    setExtraPages(0);
  }, [idsKey, baseVisibleCount]);

  const filteredItems = useMemo(() => {
    if (!allowedRolesSet) return items;
    return items.filter((item) => allowedRolesSet.has(item.role));
  }, [allowedRolesSet, items]);

  const targetFilteredCount = Math.max(0, baseVisibleCount + extraPages * pageSizeValue);
  const startIndex = Math.max(0, filteredItems.length - targetFilteredCount);
  const visibleItems = filteredItems.slice(startIndex);

  useEffect(() => {
    if (targetFilteredCount === 0) return;
    if (filteredItems.length >= targetFilteredCount) return;
    if (!hasMore || isFetching) return;
    loadMore();
  }, [filteredItems.length, targetFilteredCount, hasMore, isFetching, loadMore]);

  const highlightSet = useMemo(() => {
    if (!highlightLastCount || highlightLastCount <= 0) return new Set<string>();
    const toHighlight = filteredItems.slice(-highlightLastCount);
    const collected = new Set<string>();
    for (const item of toHighlight) {
      if (typeof item.id === 'string' && item.id.length > 0) {
        collected.add(item.id);
      }
    }
    return collected;
  }, [filteredItems, highlightLastCount]);

  const renderedCallbackRef = useRef<ContextItemsListProps['onItemsRendered']>(undefined);
  renderedCallbackRef.current = onItemsRendered;

  useEffect(() => {
    renderedCallbackRef.current?.(visibleItems);
  }, [visibleItems]);

  const handleLoadOlder = () => {
    onBeforeLoadMore?.();
    setExtraPages((prev) => prev + 1);
  };

  const buttonLabel = loadMoreLabel ?? 'Load older context';
  const emptyMessage = emptyLabel ?? 'No context items';
  const showLoadMore = (hasMore && total > 0) || filteredItems.length > targetFilteredCount;

  if (ids.length === 0) {
    return <div className="text-[11px] text-gray-500">{emptyMessage}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {showLoadMore && (
        <button
          type="button"
          className="self-start rounded border border-gray-300 bg-white px-3 py-1 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleLoadOlder}
          disabled={isFetching}
        >
          {buttonLabel}
        </button>
      )}

      {visibleItems.map((item) => {
        const textContent = toPlainText(item.contentText, item.contentJson);
        const roleColor = ROLE_COLORS[item.role] ?? ROLE_COLORS.other;
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

      {visibleItems.length === 0 && !isInitialLoading && !isFetching && !error && (
        <div className="text-[11px] text-gray-500">{emptyMessage}</div>
      )}
      {isInitialLoading && <div className="text-[11px] text-gray-500">Loading context…</div>}
      {!!error && !isInitialLoading && <div className="text-[11px] text-red-600">Failed to load context items</div>}
      {isFetching && !isInitialLoading && <div className="text-[11px] text-gray-500">Loading…</div>}
    </div>
  );
}
