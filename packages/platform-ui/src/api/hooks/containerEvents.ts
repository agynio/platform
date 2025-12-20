import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { listContainerEvents, type ContainerEventsResponse } from '@/api/modules/containers';

type QueryParams = {
  limit?: number;
  order?: 'asc' | 'desc';
  since?: string;
  cursor?: string;
};

const DEFAULT_PARAMS: QueryParams = { limit: 50, order: 'desc' };

export const eventsQueryKey = (containerId: string | null, params: QueryParams) => [
  'containers',
  containerId,
  'events',
  params.limit ?? DEFAULT_PARAMS.limit,
  params.order ?? DEFAULT_PARAMS.order,
  params.since ?? null,
] as const;

export function useContainerEvents(containerId: string | null, enabled: boolean, params: QueryParams = DEFAULT_PARAMS) {
  return useInfiniteQuery<
    ContainerEventsResponse,
    Error,
    InfiniteData<ContainerEventsResponse>,
    ReturnType<typeof eventsQueryKey>,
    string | undefined
  >({
    enabled: Boolean(containerId) && enabled,
    initialPageParam: undefined,
    queryKey: eventsQueryKey(containerId, params),
    queryFn: async ({ pageParam }) => {
      const mergedParams: QueryParams = { ...params };
      if (pageParam) mergedParams.cursor = pageParam;
      return listContainerEvents(containerId as string, mergedParams);
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page.order === 'asc') {
        return lastPage.page.nextAfter ?? undefined;
      }
      return lastPage.page.nextBefore ?? undefined;
    },
    staleTime: 10_000,
  });
}
