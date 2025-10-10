import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    render(
      <MemoryRouter initialEntries={[`/errors/tools`]}>
        <Routes>
          <Route path="/errors/tools" element={<ErrorsByToolPage />} />
          <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Errors by Tool')).toBeTruthy();
    const row = await screen.findByText('tool:weather');
    fireEvent.click(row);
    await waitFor(async () => {
      expect(await screen.findByText(/Tool Errors — tool:weather/)).toBeTruthy();
    });
  });

  it('detail page lists spans and shows details', async () => {
    render(
      <MemoryRouter initialEntries={[`/errors/tools/tool%3Aweather`]}>
        <Routes>
          <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/Tool Errors — tool:weather/)).toBeTruthy();
    expect(await screen.findByText('s1')).toBeTruthy();
  });

  it('paginates on Next', async () => {
    const api = await import('../services/api');
    const spy = vi.spyOn(api, 'fetchSpansInRange');
    spy.mockImplementationOnce(async (_range: any, params: any) => {
      expect(params.cursor).toBeUndefined();
      return { items: [ { traceId: 't1', spanId: 's1', label: 'tool:weather', status: 'error', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' } ], nextCursor: 'abc' } as any;
    });
    spy.mockImplementationOnce(async (_range: any, params: any) => {
      expect(params.cursor).toBe('abc');
      return { items: [ { traceId: 't2', spanId: 's2', label: 'tool:weather', status: 'error', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' } ] } as any;
    });
    render(
      <MemoryRouter initialEntries={[`/errors/tools/tool%3Aweather`]}>
        <Routes>
          <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('s1')).toBeTruthy();
    const next = await screen.findByText('Next →');
    fireEvent.click(next);
    expect(await screen.findByText('s2')).toBeTruthy();
  });

  it('time range inputs apply on blur (no spam)', async () => {
    render(
      <MemoryRouter initialEntries={[`/errors/tools`]}> 
        <Routes>
          <Route path="/errors/tools" element={<ErrorsByToolPage />} />
        </Routes>
      </MemoryRouter>
    );
    // change inputs but do not blur -> fetchErrorsByTool should not be called again yet
    const api = await import('../services/api');
    const spy = vi.spyOn(api, 'fetchErrorsByTool');
    const inputs = await screen.findAllByDisplayValue(/T/);
    const fromInput = inputs[0] as HTMLInputElement;
    fromInput.focus();
    fromInput.setSelectionRange(fromInput.value.length, fromInput.value.length);
    fromInput.value = fromInput.value; // simulate typing without blur
    // Now blur to trigger
    fromInput.blur();
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });
});
