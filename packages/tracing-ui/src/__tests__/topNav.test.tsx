import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { EntryLayout } from '../components/EntryLayout';
<<<<<<< HEAD
=======
import { ObsUiProvider } from '../../src/context/ObsUiProvider';
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
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
<<<<<<< HEAD
      <MemoryRouter initialEntries={[`/`]}>
=======
      <ObsUiProvider serverUrl="http://localhost:4319"><MemoryRouter initialEntries={[`/`]}>
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
        <Routes>
          <Route element={<EntryLayout />}>
            <Route path="/" element={<TracesListPage />} />
            <Route path="/errors/tools" element={<ErrorsByToolPage />} />
          </Route>
          <Route path="/trace/:traceId" element={<div>Trace</div>} />
        </Routes>
<<<<<<< HEAD
      </MemoryRouter>
=======
      </MemoryRouter></ObsUiProvider>
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
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
<<<<<<< HEAD
      <MemoryRouter initialEntries={[`/trace/abc`]}>
=======
      <ObsUiProvider serverUrl="http://localhost:4319"><MemoryRouter initialEntries={[`/trace/abc`]}> 
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
        <Routes>
          {/* Only the non-entry route is mounted here */}
          <Route path="/trace/:traceId" element={<div>Trace page</div>} />
        </Routes>
<<<<<<< HEAD
      </MemoryRouter>
=======
      </MemoryRouter></ObsUiProvider>
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
    );
    // Should not render TopNav on non-entry routes
    expect(within(container).queryByTestId('obsui-topnav')).toBeNull();
  });

  it('preserves from/to when navigating within errors tools', async () => {
    const { container } = render(
<<<<<<< HEAD
      <MemoryRouter initialEntries={[`/errors/tools?from=2024-01-01T00%3A00%3A00.000Z&to=2024-01-02T00%3A00%3A00.000Z`]}>
=======
      <ObsUiProvider serverUrl="http://localhost:4319"><MemoryRouter initialEntries={[`/errors/tools?from=2024-01-01T00%3A00%3A00.000Z&to=2024-01-02T00%3A00%3A00.000Z`]}> 
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
        <Routes>
          <Route element={<EntryLayout />}>
            <Route path="/" element={<TracesListPage />} />
            <Route path="/errors/tools" element={<ErrorsByToolPage />} />
            <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
          </Route>
        </Routes>
<<<<<<< HEAD
      </MemoryRouter>
=======
      </MemoryRouter></ObsUiProvider>
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
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
<<<<<<< HEAD
      <MemoryRouter initialEntries={[`/thread/xyz`]}>
=======
      <ObsUiProvider serverUrl="http://localhost:4319"><MemoryRouter initialEntries={[`/thread/xyz`]}> 
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
        <Routes>
          {/* Only the non-entry route is mounted here */}
          <Route path="/thread/:threadId" element={<div>Thread page</div>} />
        </Routes>
<<<<<<< HEAD
      </MemoryRouter>
=======
      </MemoryRouter></ObsUiProvider>
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
    );
    expect(within(container).queryByTestId('obsui-topnav')).toBeNull();
  });
});
