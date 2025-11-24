import type { ReminderItem } from '@/api/types/agents';
import type { ReminderStatus, ReminderVm } from './types';

type ReminderApiExtension = {
  runId?: string | null;
  cancelledAt?: string | null;
  status?: ReminderStatus;
};

function resolveStatus(item: ReminderItem & ReminderApiExtension): ReminderStatus {
  if (item.status) return item.status;
  if (item.cancelledAt) return 'cancelled';
  if (item.completedAt) return 'executed';
  return 'scheduled';
}

export function toViewModel(items: ReminderItem[]): ReminderVm[] {
  return items.map((item) => {
    const reminder = item as ReminderItem & ReminderApiExtension;
    return {
      id: reminder.id,
      note: reminder.note,
      scheduledAt: reminder.at,
      status: resolveStatus(reminder),
      threadId: reminder.threadId ?? undefined,
      runId: reminder.runId ?? undefined,
      executedAt: reminder.completedAt ?? undefined,
    } satisfies ReminderVm;
  });
}
