import { useQuery } from '@tanstack/react-query';
import {
  listReminders,
  type ListRemindersFilter,
  type ListRemindersOrder,
  type ListRemindersSort,
} from './api';
import { toViewModel } from './mappers';
import type { ReminderVmCollection } from './types';

export function useAgentsReminders(
  filter: ListRemindersFilter = 'all',
  page = 1,
  pageSize = 20,
  sort: ListRemindersSort = 'latest',
  order: ListRemindersOrder = 'desc',
  threadId?: string,
) {
  return useQuery<ReminderVmCollection, Error>({
    queryKey: ['agents', 'reminders', filter, page, pageSize, sort, order, threadId ?? null],
    queryFn: async ({ signal }) => {
      const res = await listReminders(filter, { page, pageSize, sort, order, threadId, signal });
      return {
        items: toViewModel(res.items),
        page: res.page,
        pageSize: res.pageSize,
        totalCount: res.totalCount,
        pageCount: res.pageCount,
        countsByStatus: res.countsByStatus,
        sortApplied: res.sortApplied,
      } satisfies ReminderVmCollection;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
