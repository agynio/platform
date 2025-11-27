import { http } from '@/api/http';
import type { ReminderItem } from '@/api/types/agents';
import type {
  ListRemindersFilter,
  ListRemindersSortBy,
  ListRemindersSortOrder,
  ReminderStatusCounts,
} from './types';

export interface ListRemindersOptions {
  signal?: AbortSignal;
  page?: number;
  perPage?: number;
  sortBy?: ListRemindersSortBy;
  sortOrder?: ListRemindersSortOrder;
  threadId?: string;
}

export interface ListRemindersResponse {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  sortBy: ListRemindersSortBy;
  sortOrder: ListRemindersSortOrder;
  countsByStatus: ReminderStatusCounts;
  items: ReminderItem[];
}

export async function listReminders(
  filter: ListRemindersFilter = 'active',
  options: ListRemindersOptions = {},
): Promise<ListRemindersResponse> {
  const params = new URLSearchParams();
  if (filter) params.set('filter', filter);
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.perPage !== undefined) params.set('perPage', String(options.perPage));
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);
  if (options.threadId) params.set('threadId', options.threadId);

  const query = params.toString();
  const url = `/api/agents/reminders${query ? `?${query}` : ''}`;

  return http.get<ListRemindersResponse>(url, { signal: options.signal });
}
