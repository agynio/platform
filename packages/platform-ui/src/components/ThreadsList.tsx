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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadLockRef = useRef(false);
  const previousIsLoadingRef = useRef(isLoading);

  useEffect(() => {
    const wasLoading = previousIsLoadingRef.current;
    if (wasLoading && !isLoading) {
      loadLockRef.current = false;
    }
    previousIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // Infinite scroll observer
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoading) return;

    const root = scrollContainerRef.current;
    const target = loadMoreRef.current;

    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loadLockRef.current || isLoading) return;
        loadLockRef.current = true;
        onLoadMore();
        setHasLoadedMore(true);
      },
      {
        root,
        rootMargin: '100px',
        threshold: 0,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, isLoading, threads.length]);

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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {threads.map((thread) => renderThread(thread, 0))}
        {hasMore && !isLoading && <div ref={loadMoreRef} className="h-4" />}
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-[var(--agyn-blue)] animate-spin" />
          <span className="ml-2 text-sm text-[var(--agyn-gray)]">Loading more threads...</span>
        </div>
      )}

      {/* End of List */}
      {!hasMore && hasLoadedMore && threads.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <span className="text-sm text-[var(--agyn-gray)]">No more threads to load</span>
        </div>
      )}
    </div>
  );
}
