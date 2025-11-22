import { RemindersScreen } from '@agyn/ui-new';

const placeholderReminders = [
  {
    id: 'placeholder-1',
    note: 'Placeholder reminder',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'scheduled' as const,
  },
];

export function AgentsRemindersNew() {
  return <RemindersScreen reminders={placeholderReminders} renderSidebar={false} />;
}
