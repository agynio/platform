import { asData, http } from '@/api/http';
import type { ReminderItem } from '@/api/types/agents';

export type RemindersFilter = 'active' | 'completed' | 'all';

const FILTER_DEFAULT: RemindersFilter = 'active';
const VALID_FILTERS = new Set<RemindersFilter>(['active', 'completed', 'all']);

export type ListRemindersOptions = {
  take?: number;
  threadId?: string;
};

function sanitizeFilter(value: string | null | undefined): RemindersFilter {
  if (!value) return FILTER_DEFAULT;
  return VALID_FILTERS.has(value as RemindersFilter) ? (value as RemindersFilter) : FILTER_DEFAULT;
}

export function coerceRemindersFilter(value: string | null | undefined): RemindersFilter {
  return sanitizeFilter(value);
}

export async function listReminders(
  filter: RemindersFilter,
  options: ListRemindersOptions = {},
): Promise<{ items: ReminderItem[] }> {
  const params: Record<string, string | number> = { filter };
  if (options.threadId) params.threadId = options.threadId;
  if (typeof options.take === 'number' && Number.isFinite(options.take)) {
    params.take = Math.max(1, Math.min(1000, Math.trunc(options.take)));
  }
  const res = await asData<{ items?: ReminderItem[] }>(
    http.get(`/api/agents/reminders`, { params }),
  );
  const items = Array.isArray(res.items) ? [...res.items] : [];
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { items };
}
