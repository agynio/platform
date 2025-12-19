import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RunEventDetails, type RunEvent } from '@/components/RunEventDetails';

type ContextRecord = Record<string, unknown> & {
  id: string;
  content: string;
  role?: string;
  __agynIsNew?: boolean;
};

const buildEvent = (context: ContextRecord[]): RunEvent => ({
  id: 'event-1',
  type: 'llm',
  timestamp: '2024-01-01T00:00:00.000Z',
  data: {
    context,
    assistantContext: [],
    response: '',
    toolCalls: [],
  },
});

describe('RunEventDetails context pagination', () => {
  it('renders only new context items initially', () => {
    const event = buildEvent([
      { id: 'ctx-old-1', role: 'user', content: 'Older message 1' },
      { id: 'ctx-new-1', role: 'user', content: 'New message', __agynIsNew: true },
      { id: 'ctx-old-2', role: 'user', content: 'Older message 2' },
    ]);

    render(<RunEventDetails event={event} />);

    expect(screen.getByText('New message')).toBeInTheDocument();
    expect(screen.queryByText('Older message 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Older message 2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();

    const container = screen.getByTestId('context-scroll-container');
    expect(container.firstElementChild?.textContent).toContain('Load more');
  });

  it('reveals older context items in order when loading more', async () => {
    const event = buildEvent([
      { id: 'ctx-old-1', role: 'user', content: 'Older message 1' },
      { id: 'ctx-new-1', role: 'user', content: 'New message', __agynIsNew: true },
      { id: 'ctx-old-2', role: 'user', content: 'Older message 2' },
    ]);

    render(<RunEventDetails event={event} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByText('Older message 1')).toBeInTheDocument());
    expect(screen.getByText('Older message 2')).toBeInTheDocument();

    const newEntry = screen.getByText('New message');
    const olderFirst = screen.getByText('Older message 1');
    const olderSecond = screen.getByText('Older message 2');

    expect(olderFirst.compareDocumentPosition(newEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newEntry.compareDocumentPosition(olderSecond) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows empty new-context message and loads older items on demand', async () => {
    const event = buildEvent([
      { id: 'ctx-old-1', role: 'user', content: 'Older message 1' },
      { id: 'ctx-old-2', role: 'user', content: 'Older message 2' },
    ]);

    render(<RunEventDetails event={event} />);

    expect(screen.getByText('No new context for this call.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByText('Older message 1')).toBeInTheDocument());
    expect(screen.getByText('Older message 2')).toBeInTheDocument();
    expect(screen.queryByText('No new context for this call.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('preserves scroll position when prepending older context', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const originalRaf = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;

    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    };

    window.cancelAnimationFrame = (handle: number) => {
      callbacks.splice(handle - 1, 1);
    };

    try {
      const event = buildEvent([
        { id: 'ctx-old-1', role: 'user', content: 'Older message 1' },
        { id: 'ctx-new-1', role: 'user', content: 'New message', __agynIsNew: true },
        { id: 'ctx-old-2', role: 'user', content: 'Older message 2' },
      ]);

      render(<RunEventDetails event={event} />);

      const container = screen.getByTestId('context-scroll-container');

      let currentScrollTop = 150;
      let currentScrollHeight = 400;

      Object.defineProperty(container, 'scrollTop', {
        get: () => currentScrollTop,
        set: (value) => {
          currentScrollTop = value;
        },
        configurable: true,
      });

      Object.defineProperty(container, 'scrollHeight', {
        get: () => currentScrollHeight,
        set: (value) => {
          currentScrollHeight = value;
        },
        configurable: true,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

      currentScrollHeight = 600;

      callbacks.splice(0).forEach((cb) => cb(performance.now()));

      await waitFor(() => expect(screen.getByText('Older message 1')).toBeInTheDocument());

      expect(currentScrollTop).toBe(350);
    } finally {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancel;
    }
  });
});
