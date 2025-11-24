import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle, Button, Table, Tbody, Td, Th, Thead, Tr } from '@agyn/ui';
import type { ReminderItem } from '@/api/types/agents';
import { coerceRemindersFilter, listReminders, type RemindersFilter } from '@/api/modules/reminders';

type ReminderRow = ReminderItem & {
  noteLabel: string;
  scheduledLabel: string;
  completedLabel: string;
};

const FILTER_OPTIONS: Array<{ value: RemindersFilter; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString();
}

function normalizeNote(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '(no note)';
}

function toRow(reminder: ReminderItem): ReminderRow {
  return {
    ...reminder,
    noteLabel: normalizeNote(reminder.note),
    scheduledLabel: formatDateTime(reminder.at),
    completedLabel: formatDateTime(reminder.completedAt),
  };
}

export function AgentsReminders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = coerceRemindersFilter(searchParams.get('filter'));

  const remindersQ = useQuery<{ items: ReminderItem[] }, Error>({
    queryKey: ['agents', 'reminders', filter],
    queryFn: () => listReminders(filter),
    retry: 1,
  });

  const rows = useMemo<ReminderRow[]>(() => {
    const items = remindersQ.data?.items ?? [];
    return items.map(toRow);
  }, [remindersQ.data]);

  function setFilter(next: RemindersFilter) {
    if (next === filter) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('filter', next);
    setSearchParams(nextParams, { replace: false });
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Agents / Reminders</h1>
        <p className="text-sm text-muted-foreground">Track scheduled reminders across agent threads.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_OPTIONS.map(({ value, label }) => (
          <Button
            key={value}
            variant={filter === value ? 'default' : 'outline'}
            size="sm"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => remindersQ.refetch()}
          disabled={remindersQ.isFetching}
        >
          Refresh
        </Button>
      </div>

      {remindersQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : remindersQ.error ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load reminders</AlertTitle>
          <AlertDescription>{remindersQ.error.message}</AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No reminders.</div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <Thead>
              <Tr>
                <Th className="w-48">Thread</Th>
                <Th>Note</Th>
                <Th className="w-48">Scheduled At</Th>
                <Th className="w-48">Completed At</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((reminder) => (
                <Tr key={reminder.id}>
                  <Td>
                    <Link className="font-mono text-xs underline" to={`/agents/threads/${reminder.threadId}`}>
                      {reminder.threadId}
                    </Link>
                  </Td>
                  <Td>{reminder.noteLabel}</Td>
                  <Td>{reminder.scheduledLabel}</Td>
                  <Td>{reminder.completedLabel}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
