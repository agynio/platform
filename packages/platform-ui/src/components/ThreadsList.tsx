import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ThreadItem, type Thread } from './ThreadItem';
import { Loader2 } from 'lucide-react';

interface ThreadsListProps {
  threads: Thread[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  onSelectThread?: (threadId: string) => void;
  selectedThreadId?: string;
  className?: string;
  emptyState?: ReactNode;
  onToggleExpand?: (threadId: string, isExpanded: boolean) => void;
}

export function ThreadsList({
  threads,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  onSelectThread,
  selectedThreadId,
  className = '',
  emptyState,
  onToggleExpand,
}: ThreadsListProps) {
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadPendingRef = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      loadPendingRef.current = false;
    }
  }, [isLoading]);

  // Infinite scroll observer
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (loadPendingRef.current) return;
          loadPendingRef.current = true;
          onLoadMore();
          setHasLoadedMore(true);
        }
      },
      { threshold: 0.1 }
    );

    const target = loadMoreRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [onLoadMore, hasMore, isLoading]);

  const handleToggleExpand = (threadId: string) => {
    setExpandedThreads((prev) => {
      const newSet = new Set(prev);
      const isExpanded = newSet.has(threadId);
      if (isExpanded) {
        newSet.delete(threadId);
      } else {
        newSet.add(threadId);
      }
      onToggleExpand?.(threadId, !isExpanded);
      return newSet;
    });
  };

  const renderThread = (thread: Thread, depth: number = 0): ReactNode[] => {
    const items: ReactNode[] = [];
    const isExpanded = expandedThreads.has(thread.id);

    // Render the thread item
    items.push(
      <ThreadItem
        key={thread.id}
        thread={thread}
        depth={depth}
        isExpanded={isExpanded}
        isSelected={selectedThreadId === thread.id}
        onToggleExpand={handleToggleExpand}
        onSelect={onSelectThread}
      />
    );

    // Render subthreads if expanded
    if (isExpanded) {
      if (thread.isChildrenLoading) {
        items.push(
          <div key={`${thread.id}-loading`} className="flex items-center gap-2 px-12 py-2 text-xs text-[var(--agyn-gray)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading subthreads…
          </div>,
        );
      }

      if (thread.childrenError) {
        items.push(
          <div key={`${thread.id}-error`} className="px-12 py-2 text-xs text-[var(--agyn-red)]">
            {thread.childrenError}
          </div>,
        );
      }

      if (thread.subthreads && thread.subthreads.length > 0) {
        const subthreads = thread.subthreads;
        subthreads.forEach((subthread) => {
          items.push(...renderThread(subthread, depth + 1));
        });
      } else if (!thread.isChildrenLoading && !thread.childrenError && thread.hasChildren === false) {
        items.push(
          <div key={`${thread.id}-empty`} className="px-12 py-2 text-xs text-[var(--agyn-gray)]">
            No subthreads
          </div>,
        );
      }
    }

    return items;
  };

  if (threads.length === 0 && !isLoading) {
    return (
      <div className={`flex min-h-0 flex-col bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden ${className}`}>
        <div className="flex items-center justify-center py-12 text-[var(--agyn-gray)]">
          {emptyState || <p>No threads found</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-col bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden ${className}`}
      data-testid="threads-list"
    >
      {/* Threads List */}
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => renderThread(thread, 0))}
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-[var(--agyn-blue)] animate-spin" />
          <span className="ml-2 text-sm text-[var(--agyn-gray)]">Loading more threads...</span>
        </div>
      )}

      {/* Load More Trigger */}
      {hasMore && !isLoading && <div ref={loadMoreRef} className="h-4" />}

      {/* End of List */}
      {!hasMore && hasLoadedMore && threads.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <span className="text-sm text-[var(--agyn-gray)]">No more threads to load</span>
        </div>
      )}
    </div>
  );
}
