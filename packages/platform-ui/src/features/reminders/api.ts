import { http } from '@/api/http';
import type { ReminderItem } from '@/api/types/agents';

export type ListRemindersFilter = 'all' | 'active' | 'completed' | 'cancelled';
export type ListRemindersSort = 'latest' | 'createdAt' | 'at';
export type ListRemindersOrder = 'asc' | 'desc';

export interface ListRemindersOptions {
  signal?: AbortSignal;
  threadId?: string;
  page?: number;
  pageSize?: number;
  sort?: ListRemindersSort;
  order?: ListRemindersOrder;
}

export type CountsByStatus = { scheduled: number; executed: number; cancelled: number };

export interface ListRemindersResponse {
  items: ReminderItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
  countsByStatus: CountsByStatus;
  sortApplied: { key: ListRemindersSort; order: ListRemindersOrder };
}

type LegacyResponse = { items: ReminderItem[] };

const DEFAULT_SORT: ListRemindersSort = 'latest';
const DEFAULT_ORDER: ListRemindersOrder = 'desc';
const DEFAULT_PAGE_SIZE = 20;

function isPaginatedResponse(value: unknown): value is ListRemindersResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as ListRemindersResponse;
  return (
    Array.isArray(candidate.items) &&
    typeof candidate.page === 'number' &&
    typeof candidate.pageSize === 'number' &&
    typeof candidate.totalCount === 'number' &&
    typeof candidate.pageCount === 'number' &&
    candidate.countsByStatus !== undefined &&
    candidate.sortApplied !== undefined
  );
}

function isLegacyResponse(value: unknown): value is LegacyResponse {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as LegacyResponse).items));
}

function computeCounts(items: ReminderItem[]): CountsByStatus {
  return items.reduce<CountsByStatus>(
    (acc, item) => {
      if (item.cancelledAt) {
        acc.cancelled += 1;
      } else if (item.completedAt) {
        acc.executed += 1;
      } else {
        acc.scheduled += 1;
      }
      return acc;
    },
    { scheduled: 0, executed: 0, cancelled: 0 },
  );
}

export async function listReminders(
  filter: ListRemindersFilter = 'all',
  options: ListRemindersOptions = {},
): Promise<ListRemindersResponse> {
  const params = new URLSearchParams();
  if (filter) params.set('filter', filter);
  if (options.threadId) params.set('threadId', options.threadId);
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
  if (options.sort) params.set('sort', options.sort);
  if (options.order) params.set('order', options.order);

  const query = params.toString();
  const url = `/api/agents/reminders${query ? `?${query}` : ''}`;

  const response = await http.get<unknown>(url, { signal: options.signal });

  if (isPaginatedResponse(response)) {
    return response;
  }

  if (isLegacyResponse(response)) {
    const items = response.items;
    const page = options.page ?? 1;
    const inferredPageSize = options.pageSize ?? (items.length > 0 ? items.length : DEFAULT_PAGE_SIZE);
    const totalCount = items.length;
    const pageCount = totalCount === 0 ? 0 : Math.ceil(totalCount / inferredPageSize);
    const countsByStatus = computeCounts(items);

    return {
      items,
      page,
      pageSize: inferredPageSize,
      totalCount,
      pageCount,
      countsByStatus,
      sortApplied: { key: options.sort ?? DEFAULT_SORT, order: options.order ?? DEFAULT_ORDER },
    };
  }

  throw new Error('Unexpected reminders response shape');
}

export function cancelReminder(reminderId: string) {
  return http.post<{ threadId: string; cancelledDb: boolean; clearedRuntime: number }>(
    `/api/agents/reminders/${encodeURIComponent(reminderId)}/cancel`,
    {},
  );
}
