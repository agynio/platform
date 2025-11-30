import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

type ReminderApi = {
  id: string;
  threadId: string;
  note: string;
  at: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  status?: 'scheduled' | 'executed' | 'cancelled';
};

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

function buildReminder(
  id: string,
  note: string,
  status: 'scheduled' | 'executed' | 'cancelled',
  overrides: Partial<ReminderApi> = {},
): ReminderApi {
  return {
    id,
    threadId: overrides.threadId ?? `th-${id}`,
    note,
    at: overrides.at ?? t(Number(id) * 100),
    createdAt: overrides.createdAt ?? t(Number(id) * 50),
    completedAt: status === 'executed' ? overrides.completedAt ?? t(Number(id) * 150) : null,
    cancelledAt: status === 'cancelled' ? overrides.cancelledAt ?? t(Number(id) * 175) : null,
    status,
    ...overrides,
  };
}

function computeCounts(items: ReminderApi[]) {
  return items.reduce(
    (acc, item) => {
      if (item.status === 'cancelled') acc.cancelled += 1;
      else if (item.status === 'executed') acc.executed += 1;
      else acc.scheduled += 1;
      return acc;
    },
    { scheduled: 0, executed: 0, cancelled: 0 },
  );
}

function buildResponse({
  items,
  page = 1,
  pageSize = 20,
  totalCount,
  pageCount,
  countsByStatus,
}: {
  items: ReminderApi[];
  page?: number;
  pageSize?: number;
  totalCount?: number;
  pageCount?: number;
  countsByStatus?: { scheduled: number; executed: number; cancelled: number };
}) {
  const resolvedCounts = countsByStatus ?? computeCounts(items);
  const resolvedTotal = totalCount ?? items.length;
  const resolvedPageCount = pageCount ?? (resolvedTotal === 0 ? 0 : Math.ceil(resolvedTotal / pageSize));
  return {
    items,
    page,
    pageSize,
    totalCount: resolvedTotal,
    pageCount: resolvedPageCount,
    countsByStatus: resolvedCounts,
    sortApplied: { key: 'latest', order: 'desc' },
  };
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/agents/reminders' }]}
    >
      <TestProviders>
        <AgentsReminders />
      </TestProviders>
    </MemoryRouter>,
  );
}

function expectVisiblePageButtons(expected: number[]) {
  const buttons = screen.getAllByRole('button', { name: /^\d+$/ }).map((btn) => Number(btn.textContent));
  expect(buttons).toEqual(expected);
}

describe('AgentsReminders page', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    navigateMock.mockReset();
  });
  afterAll(() => server.close());

  it('renders server-paginated reminders and requests page metadata', async () => {
    const payload = buildResponse({
      items: [buildReminder('1', 'Soon', 'scheduled')],
      page: 1,
      pageCount: 1,
      totalCount: 1,
    });
    const requests: URL[] = [];
    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      requests.push(url);
      return HttpResponse.json(payload);
    };

    server.use(
      http.get('/api/agents/reminders', handler),
      http.get(abs('/api/agents/reminders'), handler),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Reminders' })).toBeInTheDocument();
    expect(await screen.findByText('Soon')).toBeInTheDocument();

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    requests.forEach((url) => {
      expect(url.searchParams.get('filter')).toBe('all');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('pageSize')).toBe('20');
      expect(url.searchParams.get('sort')).toBe('latest');
      expect(url.searchParams.get('order')).toBe('desc');
    });

    expect(screen.getByRole('button', { name: /All \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scheduled \(1\)/i })).toBeInTheDocument();
  });

  it('shows a 7-button window centered on the current page', async () => {
    const payload = buildResponse({
      items: [buildReminder('5', 'Center', 'scheduled')],
      page: 10,
      pageCount: 20,
      totalCount: 400,
      pageSize: 20,
    });

    const handler = () => HttpResponse.json(payload);
    server.use(
      http.get('/api/agents/reminders', handler),
      http.get(abs('/api/agents/reminders'), handler),
    );

    renderPage();

    expect(await screen.findByText('Center')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: '10' })).toHaveAttribute('aria-current', 'page'));
    expectVisiblePageButtons([7, 8, 9, 10, 11, 12, 13]);
  });

  it('clamps the page window at the start', async () => {
    const payload = buildResponse({
      items: [buildReminder('1', 'Start', 'scheduled')],
      page: 1,
      pageCount: 20,
      totalCount: 400,
      pageSize: 20,
    });

    const handler = () => HttpResponse.json(payload);
    server.use(
      http.get('/api/agents/reminders', handler),
      http.get(abs('/api/agents/reminders'), handler),
    );

    renderPage();

    expect(await screen.findByText('Start')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page'));
    expectVisiblePageButtons([1, 2, 3, 4, 5, 6, 7]);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('clamps the page window at the end', async () => {
    const payload = buildResponse({
      items: [buildReminder('1', 'End', 'scheduled')],
      page: 20,
      pageCount: 20,
      totalCount: 400,
      pageSize: 20,
    });

    const handler = () => HttpResponse.json(payload);
    server.use(
      http.get('/api/agents/reminders', handler),
      http.get(abs('/api/agents/reminders'), handler),
    );

    renderPage();

    expect(await screen.findByText('End')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '20' })).toHaveAttribute('aria-current', 'page'));
    expectVisiblePageButtons([14, 15, 16, 17, 18, 19, 20]);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('invokes onPageChange for next and numeric buttons', async () => {
    const responses = [
      {
        expectedPageParam: '1',
        payload: buildResponse({
          items: [buildReminder('1', 'First page', 'scheduled')],
          page: 2,
          pageCount: 5,
          totalCount: 100,
          pageSize: 20,
        }),
      },
      {
        expectedPageParam: '3',
        payload: buildResponse({
          items: [buildReminder('2', 'Second page', 'scheduled')],
          page: 3,
          pageCount: 5,
          totalCount: 100,
          pageSize: 20,
        }),
      },
      {
        expectedPageParam: '4',
        payload: buildResponse({
          items: [buildReminder('3', 'Third page', 'scheduled')],
          page: 4,
          pageCount: 5,
          totalCount: 100,
          pageSize: 20,
        }),
      },
    ];

    let call = 0;
    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const current = responses[Math.min(call, responses.length - 1)];
      expect(url.searchParams.get('page')).toBe(current.expectedPageParam);
      const body = current.payload;
      call += 1;
      return HttpResponse.json(body);
    };

    server.use(
      http.get('/api/agents/reminders', handler),
      http.get(abs('/api/agents/reminders'), handler),
    );

    renderPage();

    expect(await screen.findByText('First page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page'));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Second page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page'));

    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(await screen.findByText('Third page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '4' })).toHaveAttribute('aria-current', 'page'));
  });

  it('shows error overlay and retries successfully', async () => {
    let attempt = 0;
    const successPayload = buildResponse({
      items: [buildReminder('1', 'Recovered', 'scheduled')],
      page: 1,
      pageCount: 1,
      totalCount: 1,
    });

    const handler = () => {
      attempt += 1;
      if (attempt === 1) return new HttpResponse(null, { status: 500 });
      return HttpResponse.json(successPayload);
    };

    server.use(
      http.get('/api/agents/reminders', handler),
      http.get(abs('/api/agents/reminders'), handler),
    );

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Request failed with status code 500');

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('navigates to thread when view action is clicked', async () => {
    navigateMock.mockClear();
    const payload = buildResponse({
      items: [buildReminder('1', 'Soon', 'scheduled')],
      page: 1,
      pageCount: 1,
      totalCount: 1,
    });

    const handler = () => HttpResponse.json(payload);
    server.use(
      http.get('/api/agents/reminders', handler),
      http.get(abs('/api/agents/reminders'), handler),
    );

    renderPage();

    const noteCell = await screen.findByText('Soon');
    const row = noteCell.closest('tr');
    expect(row).not.toBeNull();
    const actionButtons = row?.querySelectorAll('button');
    expect(actionButtons?.length).toBeGreaterThan(0);
    fireEvent.click(actionButtons![0]);

    expect(navigateMock).toHaveBeenCalledWith('/agents/threads/th-1');
  });
});
