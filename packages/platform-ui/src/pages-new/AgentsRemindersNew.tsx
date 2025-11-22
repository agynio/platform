import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RemindersScreen, type Reminder } from '@agyn/ui-new';
import { http, asData } from '@/api/http';
import type { ReminderItem } from '@/api/types/agents';

function fetchReminders() {
  return asData<{ items: ReminderItem[] }>(
    http.get('/api/agents/reminders', { params: { filter: 'all', take: 500 } }),
  );
}

function mapReminder(item: ReminderItem): Reminder {
  const status = item.completedAt ? 'executed' : 'scheduled';
  return {
    id: item.id,
    note: item.note,
    scheduledAt: item.at,
    executedAt: item.completedAt ?? undefined,
    status,
    threadId: item.threadId,
  } satisfies Reminder;
}

export function AgentsRemindersNew() {
  const navigate = useNavigate();

  const remindersQuery = useQuery({
    queryKey: ['agents', 'reminders', 'all'],
    queryFn: fetchReminders,
    retry: false,
  });

  const reminders = useMemo<Reminder[]>(() => {
    const items = remindersQuery.data?.items ?? [];
    return items
      .map(mapReminder)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  }, [remindersQuery.data]);

  if (remindersQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading reminders…</div>;
  }

  if (remindersQuery.isError) {
    const message = remindersQuery.error instanceof Error ? remindersQuery.error.message : 'Failed to load reminders';
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {message}
      </div>
    );
  }

  return (
    <RemindersScreen
      reminders={reminders}
      onViewThread={(threadId) => navigate(`/agents/threads/${threadId}`)}
      renderSidebar={false}
    />
  );
}
