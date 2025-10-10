import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { EntryLayout } from '../components/EntryLayout';
import { TracesListPage } from '../pages/TracesListPage';
import { ErrorsByToolPage } from '../pages/ErrorsByToolPage';
import { ToolErrorsPage } from '../pages/ToolErrorsPage';

// Light mocks to keep tests lean
vi.mock('../services/api', () => ({
  fetchTraces: vi.fn().mockResolvedValue([]),
  fetchErrorsByTool: vi.fn().mockResolvedValue({ items: [] }),
  fetchSpansInRange: vi.fn().mockResolvedValue({ items: [] }),
}));

describe('TopNav and EntryLayout', () => {
  it('renders on entry routes and highlights active link', async () => {
    render(
      <MemoryRouter initialEntries={[`/`]}>
        <Routes>
          <Route element={<EntryLayout />}>
            <Route path="/" element={<TracesListPage />} />
            <Route path="/errors/tools" element={<ErrorsByToolPage />} />
          </Route>
          <Route path="/trace/:traceId" element={<div>Trace</div>} />
        </Routes>
      </MemoryRouter>
    );
    // TopNav should be present
    expect(await screen.findByText('Traces')).toBeTruthy();
    expect(screen.getByText('Error tools')).toBeTruthy();
    // Traces should be active on '/'
    const tracesLink = screen.getByText('Traces');
    const tracesA = (tracesLink as HTMLElement).closest('a')!;
    expect(tracesA).toHaveAttribute('href', '/');
    expect(tracesA).toHaveAttribute('aria-current', 'page');
  });

  it('TopNav not rendered on non-entry detail routes', async () => {
    render(
      <MemoryRouter initialEntries={[`/trace/abc`]}>
        <Routes>
          <Route element={<EntryLayout />}>
            <Route path="/" element={<TracesListPage />} />
          </Route>
          <Route path="/trace/:traceId" element={<div>Trace page</div>} />
        </Routes>
      </MemoryRouter>
    );
    // Should not find nav links
    expect(screen.queryByText('Error tools')).toBeNull();
  });

  it('preserves from/to when navigating within errors tools', async () => {
    render(
      <MemoryRouter initialEntries={[`/errors/tools?from=2024-01-01T00%3A00%3A00.000Z&to=2024-01-02T00%3A00%3A00.000Z`]}>
        <Routes>
          <Route element={<EntryLayout />}>
            <Route path="/" element={<TracesListPage />} />
            <Route path="/errors/tools" element={<ErrorsByToolPage />} />
            <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const errLink = await screen.findByText('Error tools');
    const errA = (errLink as HTMLElement).closest('a')!;
    // Active on /errors/tools*
    expect(errA).toHaveAttribute('aria-current', 'page');
    expect(errA).toHaveAttribute('href', expect.stringContaining('from='));
    // Clicking Error tools should keep params
    fireEvent.click(errA);
    // Now click Traces: should not include params
    const traces = await screen.findByText('Traces');
    const tracesA2 = (traces as HTMLElement).closest('a')!;
    fireEvent.click(tracesA2);
    expect(tracesA2).toHaveAttribute('href', '/');
  });

  it('renders on /errors/tools/:label and marks Error tools active; preserves params on link', async () => {
    render(
      <MemoryRouter initialEntries={[`/errors/tools/tool%3Asearch?from=2024-05-01T00%3A00%3A00.000Z&to=2024-05-02T00%3A00%3A00.000Z`]}>
        <Routes>
          <Route element={<EntryLayout />}>
            <Route path="/" element={<TracesListPage />} />
            <Route path="/errors/tools" element={<ErrorsByToolPage />} />
            <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const errLink = await screen.findByText('Error tools');
    const errA = (errLink as HTMLElement).closest('a')!;
    expect(errA).toHaveAttribute('aria-current', 'page');
    expect(errA.getAttribute('href')).toContain('from=');
    expect(errA.getAttribute('href')).toContain('to=');
    // Clicking navigates to the list page retaining params
    fireEvent.click(errA);
    expect(await screen.findByText('Errors by Tool')).toBeTruthy();
  });

  it('TopNav not rendered on /thread/:id', async () => {
    render(
      <MemoryRouter initialEntries={[`/thread/xyz`]}>
        <Routes>
          <Route element={<EntryLayout />}>
            <Route path="/" element={<TracesListPage />} />
          </Route>
          <Route path="/thread/:threadId" element={<div>Thread page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('Error tools')).toBeNull();
    expect(screen.queryByText('Traces')).toBeNull();
  });
});
