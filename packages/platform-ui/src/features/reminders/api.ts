import { http } from '@/api/http';
import type { ReminderItem } from '@/api/types/agents';

export type ListRemindersFilter = 'active' | 'completed' | 'all';

export interface ListRemindersOptions {
  signal?: AbortSignal;
  take?: number;
  threadId?: string;
}

export async function listReminders(
  filter: ListRemindersFilter = 'all',
  options: ListRemindersOptions = {},
): Promise<{ items: ReminderItem[] }> {
  const params = new URLSearchParams();
  if (filter) params.set('filter', filter);
  if (options.take !== undefined) params.set('take', String(options.take));
  if (options.threadId) params.set('threadId', options.threadId);

  const query = params.toString();
  const url = `/api/agents/reminders${query ? `?${query}` : ''}`;

  return http.get<{ items: ReminderItem[] }>(url, { signal: options.signal });
}
