import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunEventsList, type RunEvent } from '../RunEventsList';

function buildEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    id: overrides.id ?? `event-${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? 'message',
    timestamp: overrides.timestamp ?? '2024-01-01T00:00:00.000Z',
    duration: overrides.duration,
    status: overrides.status,
    data: {
      messageSubtype: 'source',
      content: 'Example content',
      ...overrides.data,
    },
  };
}

describe('RunEventsList', () => {
  const events: RunEvent[] = [
    buildEvent({ id: 'event-1' }),
    buildEvent({ id: 'event-2' }),
    buildEvent({ id: 'event-3' }),
  ];

  it('moves selection with keyboard arrows', () => {
    const onSelect = vi.fn();

    const Harness = () => {
      const [selected, setSelected] = useState<string | undefined>('event-2');
      return (
        <RunEventsList
          events={events}
          selectedEventId={selected}
          onSelectEvent={(id) => {
            onSelect(id);
            setSelected(id);
          }}
        />
      );
    };

    render(<Harness />);

    const listbox = screen.getByRole('listbox', { name: 'Run events' });
    listbox.focus();
    expect(document.activeElement).toBe(listbox);

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('event-3');
    expect(listbox).toHaveAttribute('aria-activedescendant', 'run-events-option-event-3');

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenLastCalledWith('event-2');
    expect(listbox).toHaveAttribute('aria-activedescendant', 'run-events-option-event-2');
  });

  it('jumps to the first and last events with Home and End', () => {
    const onSelect = vi.fn();

    const Harness = () => {
      const [selected, setSelected] = useState<string | undefined>('event-2');
      return (
        <RunEventsList
          events={events}
          selectedEventId={selected}
          onSelectEvent={(id) => {
            onSelect(id);
            setSelected(id);
          }}
        />
      );
    };

    render(<Harness />);

    const listbox = screen.getByRole('listbox', { name: 'Run events' });
    listbox.focus();

    fireEvent.keyDown(listbox, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('event-1');
    expect(listbox).toHaveAttribute('aria-activedescendant', 'run-events-option-event-1');

    fireEvent.keyDown(listbox, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('event-3');
    expect(listbox).toHaveAttribute('aria-activedescendant', 'run-events-option-event-3');
  });

  it('renders inline error messaging when provided', () => {
    render(
      <RunEventsList
        events={events}
        selectedEventId="event-1"
        onSelectEvent={() => {}}
        errorMessage="Failed to load more events"
      />,
    );

    expect(screen.getByText('Failed to load more events')).toBeInTheDocument();
  });
});
