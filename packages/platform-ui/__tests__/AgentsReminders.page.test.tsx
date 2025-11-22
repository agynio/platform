import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TestProviders, server, abs } from './integration/testUtils';
import { AgentsReminders } from '../src/pages/AgentsReminders';

const renderSpy = vi.fn();
const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@agyn/ui-new', async () => {
  const actual = await vi.importActual<any>('@agyn/ui-new');
  return {
    ...actual,
    RemindersScreen: (props: Parameters<typeof actual.RemindersScreen>[0]) => {
      renderSpy(props);
      return <div data-testid="reminders-screen" />;
    },
  };
});

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsRemindersNew', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    renderSpy.mockReset();
    navigateMock.mockReset();
  });
  afterAll(() => server.close());

  it('fetches all reminders once and maps to UI model', async () => {
    const response = {
      items: [
        { id: 'r1', threadId: 'th1', note: 'Upcoming', at: t(200), createdAt: t(100), completedAt: null },
        { id: 'r2', threadId: 'th2', note: 'Finished', at: t(150), createdAt: t(120), completedAt: t(160) },
      ],
    };
    server.use(
      http.get('/api/agents/reminders', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('filter')).toBe('all');
        return HttpResponse.json(response);
      }),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json(response)),
    );

    render(
      <MemoryRouter>
        <TestProviders>
          <AgentsReminders />
        </TestProviders>
      </MemoryRouter>,
    );

    await screen.findByTestId('reminders-screen');
    const [{ reminders, renderSidebar }] = renderSpy.mock.calls.at(-1) ?? [];
    expect(renderSidebar).toBe(false);
    expect(reminders).toHaveLength(2);
    expect(reminders[0]).toMatchObject({ id: 'r1', status: 'scheduled' });
    expect(reminders[1]).toMatchObject({ id: 'r2', status: 'executed', executedAt: t(160) });
    expect(new Date(reminders[0].scheduledAt).getTime()).toBeGreaterThan(new Date(reminders[1].scheduledAt).getTime());
  });

  it('navigates to thread when RemindersScreen invokes onViewThread', async () => {
    server.use(
      http.get('/api/agents/reminders', () =>
        HttpResponse.json({ items: [{ id: 'r1', threadId: 'th1', note: 'Upcoming', at: t(200), createdAt: t(100), completedAt: null }] }),
      ),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [{ id: 'r1', threadId: 'th1', note: 'Upcoming', at: t(200), createdAt: t(100), completedAt: null }] })),
    );

    render(
      <MemoryRouter>
        <TestProviders>
          <AgentsReminders />
        </TestProviders>
      </MemoryRouter>,
    );

    await screen.findByTestId('reminders-screen');
    const [{ onViewThread }] = renderSpy.mock.calls.at(-1) ?? [];
    expect(onViewThread).toBeTypeOf('function');
    onViewThread?.('th1');
    expect(navigateMock).toHaveBeenCalledWith('/agents/threads/th1');
  });

  it('renders loading and error states when query status changes', async () => {
    server.use(
      http.get('/api/agents/reminders', () => new HttpResponse(null, { status: 500 })),
      http.get(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 500 })),
    );

    render(
      <MemoryRouter>
        <TestProviders>
          <AgentsReminders />
        </TestProviders>
      </MemoryRouter>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Request failed/);

    renderSpy.mockReset();

    server.use(
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <MemoryRouter>
        <TestProviders>
          <AgentsReminders />
        </TestProviders>
      </MemoryRouter>,
    );

    await screen.findByTestId('reminders-screen');
    await waitFor(() => {
      const [{ error }] = renderSpy.mock.calls.at(-1) ?? [];
      expect(error).toBeFalsy();
    });
  });
});
