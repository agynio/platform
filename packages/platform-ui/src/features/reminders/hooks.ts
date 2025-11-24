import { useQuery } from '@tanstack/react-query';
import { listReminders, type ListRemindersFilter } from './api';
import { toViewModel } from './mappers';
import type { ReminderVm } from './types';

export function useAgentsReminders(filter: ListRemindersFilter = 'all') {
  return useQuery<ReminderVm[], Error>({
    queryKey: ['agents', 'reminders', filter],
    queryFn: async ({ signal }) => {
      const res = await listReminders(filter, { signal });
      return toViewModel(res.items);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
