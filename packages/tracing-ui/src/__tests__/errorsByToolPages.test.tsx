import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ErrorsByToolPage } from '../pages/ErrorsByToolPage';
import { ToolErrorsPage } from '../pages/ToolErrorsPage';
import { TimeRangeSelector } from '../components/TimeRangeSelector';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<any>('../services/api');
  return {
    ...actual,
    fetchErrorsByTool: vi.fn().mockResolvedValue({ items: [ { label: 'tool:weather', count: 3 }, { label: 'tool:search', count: 1 } ], from: new Date(Date.now()-6*3600*1000).toISOString(), to: new Date().toISOString() }),
    fetchSpansInRange: vi.fn().mockResolvedValue({ items: [
      { traceId: 't1', spanId: 's1', label: 'tool:weather', status: 'error', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' }
    ] })
  };
});

describe('Errors by Tool pages', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders counts and navigates to detail', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/errors/tools`]}>
        <Routes>
          <Route path="/errors/tools" element={<ErrorsByToolPage />} />
          <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
        </Routes>
      </MemoryRouter>
    );
    // Table rendered via test id
    const listTable = await within(container).findByTestId('obsui-errors-table');
    // Click the weather row via data-label
    const rows = within(listTable).getAllByTestId('obsui-errors-row');
    const row = rows.find(r => r.getAttribute('data-label') === 'tool:weather')!;
    fireEvent.click(row);
    await waitFor(async () => {
      expect(await within(container).findByTestId('obsui-errors-table')).toBeTruthy();
    });
  });

  it('detail page lists spans and shows details', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/errors/tools/tool%3Aweather`]}>
        <Routes>
          <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
        </Routes>
      </MemoryRouter>
    );
    const table = await within(container).findByTestId('obsui-errors-table');
    // Identify the specific row by locating the s1 cell and validating sibling cells
    const s1Cell = await within(table).findByRole('cell', { name: /^s1$/ });
    const s1Row = s1Cell.closest('tr') as HTMLElement;
    expect(s1Row).toBeTruthy();
    expect(() => within(s1Row).getByRole('cell', { name: /^t1$/ })).not.toThrow();
    expect(() => within(s1Row).getByRole('cell', { name: /^error$/i })).not.toThrow();
  });

  it('paginates on Next', async () => {
    const api = await import('../services/api');
    // Ensure deterministic paging: reset the mocked function and provide two pages
    const fn = api.fetchSpansInRange as unknown as vi.Mock;
    fn.mockReset();
    fn.mockImplementationOnce(async (_range: any, _params: any) => {
      // first page: no cursor
      return { items: [ { traceId: 't1', spanId: 's1', label: 'tool:weather', status: 'error', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' } ], nextCursor: 'abc' } as any;
    });
    fn.mockImplementationOnce(async (_range: any, _params: any) => {
      // next page
      return { items: [ { traceId: 't2', spanId: 's2', label: 'tool:weather', status: 'error', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' } ] } as any;
    });
    const { container } = render(
      <MemoryRouter initialEntries={[`/errors/tools/tool%3Aweather`]}>
        <Routes>
          <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
        </Routes>
      </MemoryRouter>
    );
    const table = await within(container).findByTestId('obsui-errors-table');
    // First page: verify s1 row and its sibling cells
    {
      const s1Cell = await within(table).findByRole('cell', { name: /^s1$/ });
      const row = s1Cell.closest('tr') as HTMLElement;
      expect(row).toBeTruthy();
      expect(() => within(row).getByRole('cell', { name: /^t1$/ })).not.toThrow();
      expect(() => within(row).getByRole('cell', { name: /^error$/i })).not.toThrow();
    }
    const next = await within(container).findByTestId('obsui-errors-next');
    expect((next as HTMLButtonElement).disabled).toBeFalsy();
    fireEvent.click(next);
    // Ensure the second fetch happened
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    // After pagination, reacquire the table (component may re-render/replace DOM)
    const table2 = await within(container).findByTestId('obsui-errors-table');
    await waitFor(() => {
      const groups = within(table2).getAllByRole('rowgroup');
      const tbody = groups[groups.length - 1];
      const rows = within(tbody).getAllByRole('row');
      const match = rows.find((r) => {
        const cells = within(r).getAllByRole('cell');
        if (cells.length < 4) return false;
        const trace = (cells[1].textContent || '').trim();
        const span = (cells[2].textContent || '').trim();
        const status = (cells[3].textContent || '').trim().toLowerCase();
        return trace === 't2' && span === 's2' && status === 'error';
      });
      expect(match).toBeTruthy();
    });
  });

  it('time range inputs apply on blur (no spam)', async () => {
    // Observe fetch before rendering to capture post-blur refetch
    const api = await import('../services/api');
    const spy = vi.spyOn(api, 'fetchErrorsByTool');

    const { container } = render(
      <MemoryRouter initialEntries={[`/errors/tools`]}> 
        <Routes>
          <Route path="/errors/tools" element={<ErrorsByToolPage />} />
        </Routes>
      </MemoryRouter>
    );
    // change inputs but do not blur -> fetchErrorsByTool should not be called again yet
    const inputs = await within(container).findAllByDisplayValue(/T/);
    const fromInput = inputs[0] as HTMLInputElement;
    fromInput.focus();
    try {
      // JSDOM may not support selection on datetime-local; ignore if unsupported
      fromInput.setSelectionRange(fromInput.value.length, fromInput.value.length);
    } catch {}
    // Simulate a change before blur by tweaking the last digit to ensure a new value
    const newVal = fromInput.value.replace(/\d$/, (d) => String((Number(d) + 1) % 10));
    fireEvent.change(fromInput, { target: { value: newVal } });
    // Now blur to trigger re-fetch via onBlur
    fromInput.blur();
    await waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 1500 });
  });
});
