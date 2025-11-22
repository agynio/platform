import { useState, useEffect, useRef, ReactNode } from 'react';
import { ThreadItem, Thread } from './ThreadItem';
import { Loader2 } from 'lucide-react';

interface ThreadsListProps {
  threads: Thread[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  onToggleOpenState?: (threadId: string) => void;
  onSelectThread?: (threadId: string) => void;
  selectedThreadId?: string;
  className?: string;
  emptyState?: ReactNode;
}

export function ThreadsList({
  threads,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  onToggleOpenState,
  onSelectThread,
  selectedThreadId,
  className = '',
  emptyState,
}: ThreadsListProps) {
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
          setHasLoadedMore(true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [onLoadMore, hasMore, isLoading]);

  const handleToggleExpand = (threadId: string) => {
    setExpandedThreads((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(threadId)) {
        newSet.delete(threadId);
      } else {
        newSet.add(threadId);
      }
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
        onToggleOpenState={onToggleOpenState}
        onSelect={onSelectThread}
      />
    );

    // Render subthreads if expanded
    if (isExpanded && thread.subthreads && thread.subthreads.length > 0) {
      const subthreads = thread.subthreads;
      subthreads.forEach((subthread) => {
        items.push(...renderThread(subthread, depth + 1));
      });
    }

    return items;
  };

  if (threads.length === 0 && !isLoading) {
    return (
      <div className={`bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden ${className}`}>
        <div className="flex items-center justify-center py-12 text-[var(--agyn-gray)]">
          {emptyState || <p>No threads found</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden ${className}`}>
      {/* Threads List */}
      <div className="overflow-y-auto">
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