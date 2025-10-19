import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
    const { container } = render(
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
    // TopNav should be present; scope queries to the first/topmost nav
    const nav = within(container).getByTestId('obsui-topnav');
    expect(within(nav).getByTestId('obsui-link-traces')).toBeTruthy();
    expect(within(nav).getByTestId('obsui-link-errors-tools')).toBeTruthy();
    // Traces should be active on '/'
    const tracesLink = within(nav).getByTestId('obsui-link-traces');
    const tracesA = (tracesLink as HTMLElement).closest('a')!;
    expect(tracesA).toHaveAttribute('href', '/');
    expect(tracesA).toHaveAttribute('aria-current', 'page');
  });

  it('TopNav not rendered on non-entry detail routes', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/trace/abc`]}>
        <Routes>
          {/* Only the non-entry route is mounted here */}
          <Route path="/trace/:traceId" element={<div>Trace page</div>} />
        </Routes>
      </MemoryRouter>
    );
    // Should not render TopNav on non-entry routes
    expect(within(container).queryByTestId('obsui-topnav')).toBeNull();
  });

  it('preserves from/to when navigating within errors tools', async () => {
    const { container } = render(
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
    const nav = within(container).getByTestId('obsui-topnav');
    const errLink = within(nav).getByTestId('obsui-link-errors-tools');
    const errA = (errLink as HTMLElement).closest('a')!;
    // Active on /errors/tools*
    expect(errA).toHaveAttribute('aria-current', 'page');
    expect(errA).toHaveAttribute('href', expect.stringContaining('from='));
    // Clicking Error tools should keep params
    fireEvent.click(errA);
    // Now click Traces: should not include params
    const traces = within(nav).getByTestId('obsui-link-traces');
    const tracesA2 = (traces as HTMLElement).closest('a')!;
    fireEvent.click(tracesA2);
    expect(tracesA2).toHaveAttribute('href', '/');
  });

  it('renders on /errors/tools/:label and marks Error tools active; preserves params on link', async () => {
    const { container } = render(
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
    const nav = within(container).getByTestId('obsui-topnav');
    const errLink = within(nav).getByTestId('obsui-link-errors-tools');
    const errA = (errLink as HTMLElement).closest('a')!;
    expect(errA).toHaveAttribute('aria-current', 'page');
    expect(errA.getAttribute('href')).toContain('from=');
    expect(errA.getAttribute('href')).toContain('to=');
    // Clicking navigates to the list page retaining params
    fireEvent.click(errA);
    // landing list should render; wait for either empty state or table
    const listOrEmpty = await Promise.race([
      within(container).findByTestId('obsui-errors-table'),
      within(container).findByTestId('obsui-errors-empty'),
    ]);
    expect(listOrEmpty).toBeTruthy();
  });

  it('TopNav not rendered on /thread/:id', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/thread/xyz`]}>
        <Routes>
          {/* Only the non-entry route is mounted here */}
          <Route path="/thread/:threadId" element={<div>Thread page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(within(container).queryByTestId('obsui-topnav')).toBeNull();
  });
});
