import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TestProviders, server } from './integration/testUtils';
import { AgentsReminders } from '../src/pages/AgentsReminders';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsReminders page', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('defaults to Active filter and renders table', async () => {
    server.use(
      http.get('http://localhost:3010/api/agents/reminders', ({ request }) => {
        const url = new URL(request.url);
        const filter = url.searchParams.get('filter');
        // Default should be active
        if (filter !== 'active') return new HttpResponse(null, { status: 400 });
        return HttpResponse.json({ items: [
          { id: 'r1', threadId: 'th1', note: 'Soon', at: t(100), createdAt: t(50), completedAt: null },
        ] });
      }),
    );

    render(<MemoryRouter initialEntries={[{ pathname: '/agents/reminders' }]}><TestProviders><AgentsReminders /></TestProviders></MemoryRouter>);
    // Table should render
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
    // Completed At should show em dash when null
    const cells = within(rows[1]).getAllByRole('cell');
    expect(cells[3].textContent).toBe('—');
  });

  it('toggles filters: All and Completed', async () => {
    server.use(
      http.get('http://localhost:3010/api/agents/reminders', ({ request }) => {
        const url = new URL(request.url);
        const filter = url.searchParams.get('filter');
        if (filter === 'active') {
          return HttpResponse.json({ items: [
            { id: 'a1', threadId: 'tA', note: 'A', at: t(200), createdAt: t(100), completedAt: null },
          ] });
        } else if (filter === 'all') {
          return HttpResponse.json({ items: [
            { id: 'a1', threadId: 'tA', note: 'A', at: t(200), createdAt: t(100), completedAt: null },
            { id: 'c1', threadId: 'tC', note: 'C', at: t(150), createdAt: t(120), completedAt: t(160) },
          ] });
        } else if (filter === 'completed') {
          return HttpResponse.json({ items: [
            { id: 'c1', threadId: 'tC', note: 'C', at: t(150), createdAt: t(120), completedAt: t(160) },
          ] });
        }
        return new HttpResponse(null, { status: 400 });
      }),
    );

    render(<MemoryRouter initialEntries={[{ pathname: '/agents/reminders' }]}><TestProviders><AgentsReminders /></TestProviders></MemoryRouter>);
    // Default Active
    const table1 = await screen.findByRole('table');
    expect(within(table1).getAllByRole('row').length).toBe(2);

    // Toggle All
    fireEvent.click(screen.getByRole('button', { name: /All/i }));
    const table2 = await screen.findByRole('table');
    const rows2 = within(table2).getAllByRole('row');
    expect(rows2.length).toBe(3);

    // Toggle Completed
    fireEvent.click(screen.getByRole('button', { name: /Completed/i }));
    const table3 = await screen.findByRole('table');
    const rows3 = within(table3).getAllByRole('row');
    expect(rows3.length).toBe(2);
  });

  it('shows loading, error, and empty states', async () => {
    // First return 500 to trigger error
    server.use(
      http.get('http://localhost:3010/api/agents/reminders', () => new HttpResponse(null, { status: 500 }))
    );
    render(<MemoryRouter initialEntries={[{ pathname: '/agents/reminders' }]}><TestProviders><AgentsReminders /></TestProviders></MemoryRouter>);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // Then empty (for Active)
    server.use(
      http.get('http://localhost:3010/api/agents/reminders', ({ request }) => {
        const url = new URL(request.url);
        const filter = url.searchParams.get('filter');
        if (filter !== 'active') return new HttpResponse(null, { status: 400 });
        return HttpResponse.json({ items: [] });
      })
    );

    // Trigger refetch by toggling away then back to Active
    fireEvent.click(screen.getByRole('button', { name: /Completed/i }));
    fireEvent.click(screen.getByRole('button', { name: /Active/i }));
    // No reminders message
    expect(await screen.findByText(/No reminders/)).toBeInTheDocument();
  });
});
