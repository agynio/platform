export type ReminderStatus = 'scheduled' | 'executed' | 'cancelled';

export type ListRemindersFilter = 'active' | 'completed' | 'all';
export type ListRemindersSortBy = 'createdAt' | 'at' | 'completedAt';
export type ListRemindersSortOrder = 'asc' | 'desc';

export type ReminderStatusFilter = 'all' | 'scheduled' | 'executed' | 'cancelled';

export type ReminderStatusCounts = {
  scheduled: number;
  executed: number;
  cancelled: number;
};

export type ReminderListMetadata = {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  sortBy: ListRemindersSortBy;
  sortOrder: ListRemindersSortOrder;
  countsByStatus: ReminderStatusCounts;
};

export interface ReminderVm {
  id: string;
  note: string;
  scheduledAt: string;
  status: ReminderStatus;
  threadId?: string;
  runId?: string;
  executedAt?: string;
}
