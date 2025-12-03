import type { CountsByStatus, ListRemindersOrder, ListRemindersSort } from './api';

export type ReminderStatus = 'scheduled' | 'executed' | 'cancelled';

export interface ReminderVm {
  id: string;
  note: string;
  scheduledAt: string;
  status: ReminderStatus;
  threadId?: string;
  runId?: string;
  executedAt?: string;
}

export interface ReminderVmCollection {
  items: ReminderVm[];
  page: number;
  pageSize: number;
  totalCount: number;
  pageCount: number;
  countsByStatus: CountsByStatus;
  sortApplied: { key: ListRemindersSort; order: ListRemindersOrder };
}
