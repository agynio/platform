import { useQuery } from '@tanstack/react-query';
import { listReminders } from './api';
import { toViewModel } from './mappers';
import type {
  ListRemindersFilter,
  ListRemindersSortBy,
  ListRemindersSortOrder,
  ReminderListMetadata,
  ReminderVm,
} from './types';

export interface UseAgentsRemindersParams {
  filter: ListRemindersFilter;
  page: number;
  perPage: number;
  sortBy: ListRemindersSortBy;
  sortOrder: ListRemindersSortOrder;
  threadId?: string;
}

export interface AgentsRemindersQueryResult extends ReminderListMetadata {
  items: ReminderVm[];
}

export function useAgentsReminders(params: UseAgentsRemindersParams) {
  return useQuery<AgentsRemindersQueryResult, Error>({
    queryKey: [
      'agents',
      'reminders',
      params.filter,
      params.page,
      params.perPage,
      params.sortBy,
      params.sortOrder,
      params.threadId ?? null,
    ],
    queryFn: async ({ signal }) => {
      const { filter, ...rest } = params;
      const res = await listReminders(filter, { ...rest, signal });
      return {
        items: toViewModel(res.items),
        total: res.total,
        page: res.page,
        perPage: res.perPage,
        totalPages: res.totalPages,
        sortBy: res.sortBy,
        sortOrder: res.sortOrder,
        countsByStatus: res.countsByStatus,
      } satisfies AgentsRemindersQueryResult;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
