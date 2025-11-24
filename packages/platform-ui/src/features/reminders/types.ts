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
