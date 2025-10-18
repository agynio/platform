import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TracesListPage } from '../pages/TracesListPage';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/api', () => ({
  fetchTraces: vi.fn(),
}));
import * as api from '../services/api';

describe('TracesListPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders traces table', async () => {
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    const now = new Date().toISOString();
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      { traceId: 't1', root: { traceId: 't1', spanId: 'a', label: 'root', status: 'ok', startTime: now, completed: true, lastUpdate: now, attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now }, spanCount: 2, failedCount: 1, lastUpdate: now }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByTestId('obsui-traces-table');
    const t1Cell = await within(table).findByRole('cell', { name: /^t1$/ });
    expect(t1Cell).toBeTruthy();
  });

  it('shows messages summary for agent roots', async () => {
    const now = new Date().toISOString();
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      {
        traceId: 'a1',
        root: {
          traceId: 'a1', spanId: 'r', label: 'agent', status: 'ok', startTime: now, completed: true, lastUpdate: now,
          attributes: {
            kind: 'agent',
            inputParameters: [
              { thread: 'T' },
              { messages: [ { kind: 'human', content: 'Hello' }, { kind: 'system', content: 'Do this' } ] }
            ]
          },
          events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now
        },
        spanCount: 3, failedCount: 0, lastUpdate: now
      }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByTestId('obsui-traces-table');
    // Find the row by trace id and then inspect the messages cell
    const a1Cell = await within(table).findByRole('cell', { name: /^a1$/ });
    const row = a1Cell.closest('tr')!;
    const msgCell = row.querySelectorAll('td')[2] as HTMLElement;
    expect(msgCell.textContent).toContain('Hello | Do this');
    const span = msgCell.querySelector('span') as HTMLElement | null;
    expect(span).toBeTruthy();
    expect(span!.getAttribute('title')).toContain('Hello | Do this');
    expect(span!.getAttribute('aria-label')).toContain('Hello | Do this');
  });

  it('shows dash for non-agent roots', async () => {
    const now = new Date().toISOString();
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      {
        traceId: 'n1',
        root: {
          traceId: 'n1', spanId: 'r', label: 'root', status: 'ok', startTime: now, completed: true, lastUpdate: now,
          attributes: { kind: 'tool_call' }, events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now
        },
        spanCount: 1, failedCount: 0, lastUpdate: now
      }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByTestId('obsui-traces-table');
    const n1Cell = await within(table).findByRole('cell', { name: /^n1$/ });
    const row = n1Cell.closest('tr')!;
    const cells = row.querySelectorAll('td');
    // Columns: [0]=traceId, [1]=threadId, [2]=messages
    expect(cells[2].textContent?.trim()).toBe('-');
  });

  it('shows (+N more) for extra messages beyond two', async () => {
    const now = new Date().toISOString();
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      {
        traceId: 'a2',
        root: {
          traceId: 'a2', spanId: 'r', label: 'agent', status: 'ok', startTime: now, completed: true, lastUpdate: now,
          attributes: {
            kind: 'agent',
            inputParameters: { messages: [ { content: 'm1' }, { content: 'm2' }, { content: 'm3' }, { content: 'm4' } ] }
          }, events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now
        },
        spanCount: 4, failedCount: 0, lastUpdate: now
      }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByTestId('obsui-traces-table');
    const a2Cell = await within(table).findByRole('cell', { name: /^a2$/ });
    const row = a2Cell.closest('tr')!;
    const msgCell = row.querySelectorAll('td')[2];
    expect(msgCell.textContent).toContain('m1 | m2');
    expect(msgCell.textContent).toContain('(+2 more)');
    expect(msgCell.textContent).not.toContain('m3');
  });

  it('truncates very long content in cell and sets full tooltip', async () => {
    const now = new Date().toISOString();
    const long = 'x'.repeat(600);
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      {
        traceId: 'a3',
        root: {
          traceId: 'a3', spanId: 'r', label: 'agent', status: 'ok', startTime: now, completed: true, lastUpdate: now,
          attributes: {
            kind: 'agent',
            inputParameters: { messages: [ { content: long }, { content: long } ] }
          }, events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now
        },
        spanCount: 2, failedCount: 0, lastUpdate: now
      }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByTestId('obsui-traces-table');
    const a3Cell = await within(table).findByRole('cell', { name: /^a3$/ });
    const row = a3Cell.closest('tr')!;
    const msgCell = row.querySelectorAll('td')[2] as HTMLElement;
    // Cell should contain an ellipsis due to truncation
    expect(msgCell.textContent).toContain('…');
    const title = msgCell.querySelector('span')?.getAttribute('title') || '';
    expect(title.length).toBeGreaterThan(100); // big tooltip
    expect(title.length).toBeLessThanOrEqual(1001); // capped at 1000 + ellipsis
    expect(title.endsWith('…')).toBe(true);
  });

  it('parses stringified JSON inputParameters', async () => {
    const now = new Date().toISOString();
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    const stringified = JSON.stringify({ messages: [{ content: 'S1' }, { content: 'S2' }] });
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      {
        traceId: 'a4',
        root: {
          traceId: 'a4', spanId: 'r', label: 'agent', status: 'ok', startTime: now, completed: true, lastUpdate: now,
          attributes: { kind: 'agent', inputParameters: stringified },
          events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now
        },
        spanCount: 2, failedCount: 0, lastUpdate: now
      }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByRole('table');
    const a4Cell = await within(table).findByRole('cell', { name: /^a4$/ });
    const row = a4Cell.closest('tr')!;
    const msgCell = row.querySelectorAll('td')[2] as HTMLElement;
    expect(msgCell.textContent).toContain('S1 | S2');
  });

  it('ignores non-string content values', async () => {
    const now = new Date().toISOString();
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      {
        traceId: 'a5',
        root: {
          traceId: 'a5', spanId: 'r', label: 'agent', status: 'ok', startTime: now, completed: true, lastUpdate: now,
          attributes: { kind: 'agent', inputParameters: { messages: [{ content: 123 }, { content: null }, { content: 'ok' }] } },
          events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now
        },
        spanCount: 3, failedCount: 0, lastUpdate: now
      }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByRole('table');
    const a5Cell = await within(table).findByRole('cell', { name: /^a5$/ });
    const row = a5Cell.closest('tr')!;
    const msgCell = row.querySelectorAll('td')[2];
    expect(msgCell.textContent).toContain('ok');
    expect(msgCell.textContent).not.toContain('123');
  });

  it('renders dash when agent root has no messages', async () => {
    const now = new Date().toISOString();
    type TracesResponse = Awaited<ReturnType<typeof api.fetchTraces>>;
    vi.mocked(api.fetchTraces).mockResolvedValueOnce([
      {
        traceId: 'a6',
        root: {
          traceId: 'a6', spanId: 'r', label: 'agent', status: 'ok', startTime: now, completed: true, lastUpdate: now,
          attributes: { kind: 'agent' },
          events: [], rev: 0, idempotencyKeys: [], createdAt: now, updatedAt: now
        },
        spanCount: 1, failedCount: 0, lastUpdate: now
      }
    ] as TracesResponse);
    const { container } = render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const table = await within(container).findByRole('table');
    const a6Cell = await within(table).findByRole('cell', { name: /^a6$/ });
    const row = a6Cell.closest('tr')!;
    const msgCell = row.querySelectorAll('td')[2];
    expect(msgCell.textContent?.trim()).toBe('-');
  });
});
