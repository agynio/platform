type PaginationBarProps = {
  itemCount: number;
  itemLabel: string;
  itemLabelPlural?: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
};

export function PaginationBar({
  itemCount,
  itemLabel,
  itemLabelPlural,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: PaginationBarProps) {
  if (itemCount === 0) {
    return null;
  }

  const label = itemCount === 1 ? itemLabel : itemLabelPlural ?? `${itemLabel}s`;
  const buttonLabel = isLoadingMore ? 'Loading…' : hasMore ? 'Load more' : 'All loaded';

  return (
    <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--agyn-text-subtle)]">
          Loaded {itemCount} {label}
        </div>
        <button
          type="button"
          onClick={onLoadMore}
          disabled={!hasMore || isLoadingMore}
          className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
