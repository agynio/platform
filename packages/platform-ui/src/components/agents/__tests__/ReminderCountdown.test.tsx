import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ReminderCountdown } from '../ReminderCountdown';

describe('ReminderCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders countdown for upcoming reminder', () => {
    render(
      <ReminderCountdown
        threadId="thread-12345678"
        at={new Date('2024-01-01T00:00:10Z').toISOString()}
        note="Follow up with agent"
      />,
    );

    expect(screen.getByText(/Reminder for thread/i)).toBeInTheDocument();
    expect(screen.getByText('Follow up with agent')).toBeInTheDocument();
    expect(screen.getByText('Due in 00:00:10')).toBeInTheDocument();
  });

  it('invokes onExpire once when due time reached', () => {
    const onExpire = vi.fn();
    render(
      <ReminderCountdown
        threadId="thread-abcdef01"
        at={new Date('2024-01-01T00:00:03Z').toISOString()}
        note="Check result"
        onExpire={onExpire}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Reminder reached')).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
