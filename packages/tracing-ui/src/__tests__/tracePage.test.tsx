import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TracePage } from '../pages/TracePage';
<<<<<<< HEAD
=======
import { ObsUiProvider } from '../../src/context/ObsUiProvider';
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/api', () => ({
  fetchTrace: vi.fn().mockResolvedValue([
    { traceId: 't1', spanId: 'a', label: 'root', status: 'ok', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' },
    { traceId: 't1', spanId: 'b', parentSpanId: 'a', label: 'child', status: 'ok', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' }
  ]),
  fetchLogs: vi.fn().mockResolvedValue([])
}));

vi.mock('react-router-dom', async (orig) => {
  const actual: any = await orig();
  return { ...actual, useParams: () => ({ traceId: 't1' }) } as any;
});

describe('TracePage', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('renders timeline then span details after click', async () => {
<<<<<<< HEAD
    const { container } = render(<MemoryRouter><TracePage /></MemoryRouter>);
=======
    const { container } = render(<ObsUiProvider serverUrl="http://localhost:4319"><MemoryRouter><TracePage /></MemoryRouter></ObsUiProvider>);
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
    // Use test ids on the trace page layout
    const root = await within(container).findByTestId('obsui-trace-root');
    const left = await within(container).findByTestId('obsui-trace-left');
    const timeline = await within(container).findByTestId('obsui-trace-timeline-header');
    expect(root && left && timeline).toBeTruthy();
    // Click the first span row (root)
    const firstSpan = left.querySelector('[data-span-id]') as HTMLElement;
    fireEvent.click(firstSpan);
    // After selecting span, expect Tabs container to be present by looking for a button with text IO or Attributes
    const tabs = Array.from(container.querySelectorAll('button')).filter(b => /Attributes|IO|Logs/.test(b.textContent || ''));
    expect(tabs.length).toBeGreaterThan(0);
  });
});
