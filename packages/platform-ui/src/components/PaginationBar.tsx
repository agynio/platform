import { computePaginationWindow } from '@/lib/pagination';

type PaginationBarProps = {
  page: number;
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
  totalCount: number;
  itemLabel: string;
  itemLabelPlural?: string;
  onPageChange: (page: number) => void;
};

export function PaginationBar({
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  totalCount,
  itemLabel,
  itemLabelPlural,
  onPageChange,
}: PaginationBarProps) {
  if (pageCount <= 1) {
    return null;
  }

  const label = totalCount === 1 ? itemLabel : itemLabelPlural ?? `${itemLabel}s`;
  const { start: windowStart, end: windowEnd } = computePaginationWindow(page, pageCount);
  const pageNumbers = windowEnd < windowStart
    ? []
    : Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index);

  return (
    <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--agyn-text-subtle)]">
          Showing {rangeStart} to {rangeEnd} of {totalCount} {label}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => onPageChange(pageNumber)}
                className={`w-8 h-8 rounded-md text-sm transition-all ${
                  page === pageNumber
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] font-medium'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
                aria-current={page === pageNumber ? 'page' : undefined}
              >
                {pageNumber}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            disabled={page === pageCount}
            className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
