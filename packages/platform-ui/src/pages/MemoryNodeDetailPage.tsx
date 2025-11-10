import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { memoryApi, type MemoryDocItem } from '@/api/modules/memory';
import { MemoryTree } from '@/components/memory/MemoryTree';
import { MemoryEditor } from '@/components/memory/MemoryEditor';
import { ThreadSelector } from '@/components/memory/ThreadSelector';
import { normalizeMemoryPath } from '@/components/memory/path';

const THREAD_STORAGE_PREFIX = 'ui.memory.selectedThread.';

export function MemoryNodeDetailPage() {
  const params = useParams();
  const nodeIdParam = params.nodeId ?? '';
  const nodeId = decodeURIComponent(nodeIdParam);
  const [searchParams, setSearchParams] = useSearchParams();

  const docsQuery = useQuery({
    queryKey: ['memory/docs'],
    queryFn: () => memoryApi.listDocs(),
    staleTime: 30_000,
  });

  const updateSearchParams = useCallback(
    (mutator: (next: URLSearchParams) => void, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      mutator(next);
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  const pathParam = searchParams.get('path');
  const rawThreadParam = searchParams.get('thread');
  const selectedPath = normalizeMemoryPath(pathParam ?? '/');

  useEffect(() => {
    if (!pathParam) {
      updateSearchParams((next) => {
        next.set('path', '/');
      }, { replace: true });
    }
  }, [pathParam, updateSearchParams]);

  const nodeDocs = useMemo(() => {
    const items = docsQuery.data?.items ?? [];
    return items.filter((item: MemoryDocItem) => item.nodeId === nodeId);
  }, [docsQuery.data, nodeId]);

  const scope: 'global' | 'perThread' = useMemo(() => {
    if (nodeDocs.some((doc) => doc.scope === 'perThread')) {
      return 'perThread';
    }
    return 'global';
  }, [nodeDocs]);

  const threadOptions = useMemo(() => {
    if (scope !== 'perThread') return [] as string[];
    const set = new Set<string>();
    for (const doc of nodeDocs) {
      if (doc.threadId) {
        set.add(doc.threadId);
      }
    }
    return Array.from(set).sort();
  }, [nodeDocs, scope]);

  const isPerThread = scope === 'perThread';
  const hasThreads = threadOptions.length > 0;
  const selectedThread = isPerThread && rawThreadParam && threadOptions.includes(rawThreadParam)
    ? rawThreadParam
    : undefined;

  // Clean up invalid thread params and populate from localStorage if available.
  useEffect(() => {
    if (!isPerThread) {
      if (rawThreadParam) {
        updateSearchParams((next) => {
          next.delete('thread');
        }, { replace: true });
      }
      return;
    }
    if (docsQuery.isLoading || docsQuery.error) return;
    if (rawThreadParam && !threadOptions.includes(rawThreadParam)) {
      updateSearchParams((next) => {
        next.delete('thread');
      }, { replace: true });
    }
  }, [isPerThread, rawThreadParam, threadOptions, docsQuery.isLoading, docsQuery.error, updateSearchParams]);

  useEffect(() => {
    if (!isPerThread || !hasThreads) return;
    if (selectedThread) {
      try {
        localStorage.setItem(`${THREAD_STORAGE_PREFIX}${nodeId}`, selectedThread);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const stored = localStorage.getItem(`${THREAD_STORAGE_PREFIX}${nodeId}`);
      if (stored && threadOptions.includes(stored)) {
        updateSearchParams((next) => {
          next.set('thread', stored);
          next.set('path', '/');
        });
      }
    } catch {
      /* ignore */
    }
  }, [isPerThread, hasThreads, selectedThread, threadOptions, nodeId, updateSearchParams]);

  const handleThreadChange = useCallback(
    (threadId: string) => {
      updateSearchParams((next) => {
        next.set('thread', threadId);
        next.set('path', '/');
      });
      try {
        localStorage.setItem(`${THREAD_STORAGE_PREFIX}${nodeId}`, threadId);
      } catch {
        /* ignore */
      }
    },
    [nodeId, updateSearchParams],
  );

  const handleSelectPath = useCallback(
    (nextPath: string) => {
      const normalized = normalizeMemoryPath(nextPath);
      updateSearchParams((next) => {
        next.set('path', normalized);
      });
    },
    [updateSearchParams],
  );

  const handlePathChange = useCallback(
    (nextPath: string) => {
      const normalized = normalizeMemoryPath(nextPath);
      updateSearchParams((next) => {
        next.set('path', normalized);
      }, { replace: true });
    },
    [updateSearchParams],
  );

  const detailState = (() => {
    if (docsQuery.isLoading) return 'loading' as const;
    if (docsQuery.error) return 'error' as const;
    if (!nodeId || nodeDocs.length === 0) return 'missing' as const;
    if (isPerThread && !hasThreads) return 'no-threads' as const;
    if (isPerThread && !selectedThread) return 'select-thread' as const;
    return 'ready' as const;
  })();

  const scopeBadgeClass =
    scope === 'perThread'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-gray-100 text-gray-700';

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <Link to="/memory" className="text-xs text-primary hover:underline">
              &larr; Back to nodes
            </Link>
            <h1 className="text-xl font-semibold break-all">{nodeId}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs uppercase ${scopeBadgeClass}`}>
              {scope}
            </span>
          </div>
          {isPerThread ? (
            <div className="min-w-[220px]">
              <ThreadSelector threads={threadOptions} value={selectedThread} onChange={handleThreadChange} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {detailState === 'loading' ? (
          <div className="p-4 text-sm text-muted-foreground">Loading memory node…</div>
        ) : detailState === 'error' ? (
          <div className="p-4 text-sm text-red-600" role="alert">
            {(docsQuery.error as Error).message || 'Failed to load memory documentation'}
          </div>
        ) : detailState === 'missing' ? (
          <div className="p-4 space-y-2">
            <div className="text-sm text-red-600" role="alert">
              Unknown memory node: {nodeId}
            </div>
            <Link to="/memory" className="text-sm text-primary hover:underline">
              View memory nodes list
            </Link>
          </div>
        ) : detailState === 'no-threads' ? (
          <div className="p-4 text-sm text-muted-foreground">No threads found for this memory node.</div>
        ) : detailState === 'select-thread' ? (
          <div className="p-4 text-sm text-muted-foreground">
            Select a thread to inspect memory entries.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col md:flex-row">
            <div className="border-b md:border-b-0 md:border-r md:w-80 md:min-w-[280px]">
              <MemoryTree
                nodeId={nodeId}
                scope={scope}
                threadId={isPerThread ? selectedThread : undefined}
                selectedPath={selectedPath}
                onSelectPath={handleSelectPath}
                className="h-[300px] md:h-full"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <MemoryEditor
                nodeId={nodeId}
                scope={scope}
                threadId={isPerThread ? selectedThread : undefined}
                path={selectedPath}
                onPathChange={handlePathChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
