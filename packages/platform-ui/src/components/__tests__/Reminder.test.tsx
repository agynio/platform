import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { Reminder } from '../Reminder';
import { vi } from 'vitest';

describe('Reminder countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses utcTs for countdown even with localized scheduled time', async () => {
    render(
      <Reminder content="국제화 알림" scheduledTime="오후 6시 30분" utcTs="2024-06-01T12:30:00Z" />,
    );

    expect(screen.getByText('오후 6시 30분')).toBeInTheDocument();
    expect(screen.getByText('국제화 알림')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByText(/\(in \d+m\)/)).toBeInTheDocument();
  });

  it('updates countdown over time using utcTs', async () => {
    render(
      <Reminder content="타이머 확인" scheduledTime="오후 6시 30분" utcTs="2024-06-01T12:30:00Z" />,
    );

    await act(async () => {});
    expect(screen.getByText(/\(in \d+m\)/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(screen.getByText('(now)')).toBeInTheDocument();
  });
});
