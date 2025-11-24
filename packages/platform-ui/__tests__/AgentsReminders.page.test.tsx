import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type * as ReactRouterDom from 'react-router-dom';

const navigateMock = vi.fn<(path: string) => void>();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TestProviders, server, abs } from './integration/testUtils';
import { AgentsReminders } from '../src/pages/AgentsReminders';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/agents/reminders' }]}>
      <TestProviders>
        <AgentsReminders />
      </TestProviders>
    </MemoryRouter>,
  );
}

describe('AgentsReminders page', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    navigateMock.mockReset();
  });
  afterAll(() => server.close());

  it('renders reminders with the new layout', async () => {
    const payload = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'Soon', at: t(100), createdAt: t(50), completedAt: null },
      ],
    };
    server.use(
      http.get('/api/agents/reminders', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('filter')).toBe('all');
        return HttpResponse.json(payload);
      }),
      http.get(abs('/api/agents/reminders'), ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('filter')).toBe('all');
        return HttpResponse.json(payload);
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText('Soon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('filters reminders client-side by status', async () => {
    const payload = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'Soon', at: t(100), createdAt: t(50), completedAt: null },
        { id: 'r2', threadId: 'th2', note: 'Done', at: t(200), createdAt: t(150), completedAt: t(210) },
      ],
    };
    server.use(
      http.get('/api/agents/reminders', () => HttpResponse.json(payload)),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json(payload)),
    );

    renderPage();

    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: /Executed \(1\)/i }));
    await waitFor(() => {
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(2);
      expect(within(rows[1]).queryByText('Soon')).not.toBeInTheDocument();
      expect(within(rows[1]).getByText('Done')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Scheduled \(1\)/i }));
    await waitFor(() => {
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(2);
      expect(within(rows[1]).getByText('Soon')).toBeInTheDocument();
    });
  });

  it('shows error overlay and retries successfully', async () => {
    let attempt = 0;
    server.use(
      http.get('/api/agents/reminders', () => {
        attempt += 1;
        if (attempt === 1) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json({ items: [{ id: 'r1', threadId: 'th1', note: 'Recovered', at: t(100), createdAt: t(50), completedAt: null }] });
      }),
      http.get(abs('/api/agents/reminders'), () => {
        attempt += 1;
        if (attempt === 1) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json({ items: [{ id: 'r1', threadId: 'th1', note: 'Recovered', at: t(100), createdAt: t(50), completedAt: null }] });
      }),
    );

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Request failed with status code 500');

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('navigates to thread when view action is clicked', async () => {
    navigateMock.mockClear();

    const payload = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'Soon', at: t(100), createdAt: t(50), completedAt: null },
      ],
    };
    server.use(
      http.get('/api/agents/reminders', () => HttpResponse.json(payload)),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json(payload)),
    );

    renderPage();

    const noteCell = await screen.findByText('Soon');
    const row = noteCell.closest('tr');
    expect(row).not.toBeNull();
    const actionButtons = within(row as HTMLTableRowElement).getAllByRole('button');
    fireEvent.click(actionButtons[0]);

    expect(navigateMock).toHaveBeenCalledWith('/agents/threads/th1');
  });
});
