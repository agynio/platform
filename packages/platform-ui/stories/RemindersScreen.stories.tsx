import type { Meta, StoryObj } from '@storybook/react';
import RemindersScreen from '@/components/screens/RemindersScreen';
import { withMainLayout } from './decorators/withMainLayout';

const reminders = [
  {
    id: 'reminder-1',
    note: 'Review staging metrics',
    scheduledAt: '2024-11-05T11:30:00Z',
    status: 'scheduled' as const,
    threadId: 'thread-alpha',
  },
  {
    id: 'reminder-2',
    note: 'Post incident summary',
    scheduledAt: '2024-11-05T14:00:00Z',
    status: 'scheduled' as const,
    threadId: 'thread-bravo',
  },
  {
    id: 'reminder-3',
    note: 'Confirm actions completed',
    scheduledAt: '2024-11-04T09:00:00Z',
    status: 'executed' as const,
    runId: 'run-alpha-1',
    executedAt: '2024-11-04T09:05:00Z',
  },
];

const meta: Meta<typeof RemindersScreen> = {
  title: 'Screens/Reminders',
  component: RemindersScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/reminders',
      initialEntry: '/agents/reminders',
    },
    selectedMenuItem: 'reminders',
  },
  args: {
    reminders,
    countsByStatus: {
      scheduled: 2,
      executed: 1,
      cancelled: 0,
    },
    totalCount: reminders.length,
    page: 1,
    pageSize: 10,
    pageCount: 1,
    filter: 'all',
    sortApplied: { key: 'scheduled_at', order: 'desc' },
    onViewThread: () => undefined,
    onViewRun: () => undefined,
    onCancelReminder: () => undefined,
    isCancellingReminder: () => false,
    onFilterChange: () => undefined,
    onPageChange: () => undefined,
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof RemindersScreen>;

export const Default: Story = {};
