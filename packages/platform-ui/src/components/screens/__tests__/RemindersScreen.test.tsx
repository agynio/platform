import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RemindersScreen, { type Reminder } from '../RemindersScreen';

const baseReminder = {
  note: 'Follow up with user',
  scheduledAt: '2026-02-10T10:00:00.000Z',
  status: 'scheduled' as const,
};

const baseCounts = { scheduled: 1, executed: 0, cancelled: 0 };

function renderScreen(overrides: Partial<React.ComponentProps<typeof RemindersScreen>> = {}) {
  const reminders: Reminder[] = overrides.reminders ?? [
    { ...baseReminder, id: 'rem-1' },
  ];

  const props: React.ComponentProps<typeof RemindersScreen> = {
    reminders,
    countsByStatus: overrides.countsByStatus ?? baseCounts,
    totalCount: overrides.totalCount ?? reminders.length,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? reminders.length,
    pageCount: overrides.pageCount ?? 1,
    filter: overrides.filter ?? 'all',
    onCancelReminder: overrides.onCancelReminder,
    isCancellingReminder: overrides.isCancellingReminder,
    onFilterChange: overrides.onFilterChange,
    onPageChange: overrides.onPageChange,
    onViewRun: overrides.onViewRun,
    onViewThread: overrides.onViewThread,
    sortApplied: overrides.sortApplied,
  };

  return render(<RemindersScreen {...props} />);
}

describe('RemindersScreen', () => {
  it('renders cancel action only for scheduled reminders', () => {
    renderScreen({
      reminders: [
        { ...baseReminder, id: 'scheduled-1', status: 'scheduled' },
        { ...baseReminder, id: 'executed-1', status: 'executed' },
        { ...baseReminder, id: 'cancelled-1', status: 'cancelled' },
      ],
      countsByStatus: { scheduled: 1, executed: 1, cancelled: 1 },
      onCancelReminder: vi.fn(),
      isCancellingReminder: () => false,
    });

    const buttons = screen.getAllByRole('button', { name: 'Cancel reminder' });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeEnabled();
    expect(screen.queryByText('Cancel reminder?')).not.toBeInTheDocument();
  });

  it('opens confirmation modal and calls handler when confirmed', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onCancelReminder = vi.fn();

    renderScreen({ onCancelReminder, isCancellingReminder: () => false });

    await user.click(screen.getByRole('button', { name: 'Cancel reminder' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel reminder?' });
    expect(dialog).toBeInTheDocument();

    const confirmButton = within(dialog).getByRole('button', { name: 'Cancel reminder' });
    await user.click(confirmButton);

    expect(onCancelReminder).toHaveBeenCalledWith('rem-1');
    expect(screen.queryByRole('dialog', { name: 'Cancel reminder?' })).not.toBeInTheDocument();
  });

  it('disables action button while reminder is cancelling', () => {
    renderScreen({
      onCancelReminder: vi.fn(),
      isCancellingReminder: (id) => id === 'rem-1',
    });

    const button = screen.getByRole('button', { name: 'Cancel reminder' });
    expect(button).toBeDisabled();
    expect(button.querySelector('svg.animate-spin')).not.toBeNull();
  });
});
