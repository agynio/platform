import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { contextItems } from '@/api/modules/contextItems';
import type { ContextItem } from '@/api/types/agents';

const BASE_KEY = ['agents', 'context-items'] as const;
const DEFAULT_INITIAL_COUNT = 10;
const DEFAULT_PAGE_SIZE = 10;

export type UseContextItemsOptions = {
  initialCount?: number;
  pageSize?: number;
  scopeKey?: {
    runId?: string;
    eventId?: string;
  };
};

export type UseContextItemsResult = {
  items: ContextItem[];
  total: number;
  loadedCount: number;
  targetCount: number;
  hasMore: boolean;
  isInitialLoading: boolean;
  isFetching: boolean;
  error: unknown;
  loadMore: () => void;
};

export function useContextItems(ids: readonly string[] | undefined, options?: UseContextItemsOptions): UseContextItemsResult {
  const queryClient = useQueryClient();
  const allIds = useMemo(() => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : []), [ids]);

  const scopeRunId = typeof options?.scopeKey?.runId === 'string' && options.scopeKey.runId.length > 0 ? options.scopeKey.runId : '';
  const scopeEventId = typeof options?.scopeKey?.eventId === 'string' && options.scopeKey.eventId.length > 0 ? options.scopeKey.eventId : '';

  const scopeFragment = useMemo(() => {
    if (!scopeRunId && !scopeEventId) return '';
    return `${scopeRunId}::${scopeEventId}`;
  }, [scopeEventId, scopeRunId]);

  const sanitizedInitialCount = useMemo(() => {
    if (options?.initialCount === undefined) return DEFAULT_INITIAL_COUNT;
    if (typeof options.initialCount !== 'number' || !Number.isFinite(options.initialCount)) return DEFAULT_INITIAL_COUNT;
    return Math.max(0, Math.floor(options.initialCount));
  }, [options?.initialCount]);

  const sanitizedPageSize = useMemo(() => {
    if (options?.pageSize === undefined) {
      const baseline = sanitizedInitialCount > 0 ? sanitizedInitialCount : DEFAULT_PAGE_SIZE;
      return Math.max(1, baseline);
    }
    if (typeof options.pageSize !== 'number' || !Number.isFinite(options.pageSize)) {
      const baseline = sanitizedInitialCount > 0 ? sanitizedInitialCount : DEFAULT_PAGE_SIZE;
      return Math.max(1, baseline);
    }
    return Math.max(1, Math.floor(options.pageSize));
  }, [options?.pageSize, sanitizedInitialCount]);

  const [visibleCount, setVisibleCount] = useState(() => Math.min(sanitizedInitialCount, allIds.length));
  const [cacheVersion, setCacheVersion] = useState(0);

  const idsKey = useMemo(() => {
    const joinedIds = allIds.join('|');
    if (!scopeFragment) return joinedIds;
    return `${scopeFragment}::${joinedIds}`;
  }, [allIds, scopeFragment]);

  useEffect(() => {
    setVisibleCount(Math.min(sanitizedInitialCount, allIds.length));
  }, [idsKey, sanitizedInitialCount, allIds.length]);

  const windowIds = useMemo(() => {
    if (allIds.length === 0) return [] as string[];
    const start = Math.max(0, allIds.length - visibleCount);
    return allIds.slice(start);
  }, [allIds, visibleCount]);

  useEffect(() => {
    setCacheVersion((version) => version + 1);
  }, [windowIds]);

  const missingIds = useMemo(() => {
    void cacheVersion;
    if (windowIds.length === 0) return [] as string[];
    const missing: string[] = [];
    for (const id of windowIds) {
      const cached = queryClient.getQueryData<ContextItem>([...BASE_KEY, id]);
      if (!cached) missing.push(id);
    }
    return missing;
  }, [windowIds, queryClient, cacheVersion]);

  const batchQuery = useQuery({
    queryKey: [...BASE_KEY, 'batch', scopeFragment, missingIds.join('|')],
    queryFn: () => contextItems.getMany(missingIds),
    enabled: missingIds.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    structuralSharing: false,
  });

  useEffect(() => {
    if (!batchQuery.data) return;
    for (const item of batchQuery.data) {
      queryClient.setQueryData([...BASE_KEY, item.id], item);
    }
    setCacheVersion((version) => version + 1);
  }, [batchQuery.data, queryClient]);

  const items = useMemo(() => {
    void cacheVersion;
    if (windowIds.length === 0) return [] as ContextItem[];
    const resolved: ContextItem[] = [];
    for (const id of windowIds) {
      const cached = queryClient.getQueryData<ContextItem>([...BASE_KEY, id]);
      if (cached) resolved.push(cached);
    }
    return resolved;
  }, [windowIds, queryClient, cacheVersion]);

  const hasMore = visibleCount < allIds.length;
  const isInitialLoading = items.length === 0 && windowIds.length > 0 && batchQuery.isLoading;

  const loadMore = useCallback(() => {
    if (allIds.length === 0) return;
    setVisibleCount((prev) => {
      if (prev >= allIds.length) return prev;
      const next = Math.min(allIds.length, prev + sanitizedPageSize);
      return next;
    });
  }, [allIds.length, sanitizedPageSize]);

  return {
    items,
    total: allIds.length,
    loadedCount: items.length,
    targetCount: windowIds.length,
    hasMore,
    isInitialLoading,
    isFetching: batchQuery.isFetching,
    error: batchQuery.error,
    loadMore,
  };
}
