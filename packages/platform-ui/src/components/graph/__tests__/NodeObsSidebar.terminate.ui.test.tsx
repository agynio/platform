/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mocks MUST be declared before importing the component under test
vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({ getTemplate: (_name: string) => ({ kind: 'agent' }) }),
}));
vi.mock('@/lib/graph/hooks', () => ({ useNodeReminders: () => ({ isLoading: false, data: { items: [] } }) }));
// Prevent network during span seeding; return empty list by default
vi.mock('@/api/modules/tracing', () => ({
  fetchSpansInRange: vi.fn(async () => []),
}));
vi.mock('@/api/modules/graph', () => ({
  graph: {
    listNodeRuns: vi.fn(async () => ({ items: [{ nodeId: 'n', threadId: 't', runId: 't/run-1', status: 'running', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] })),
    terminateRun: vi.fn(async () => ({ status: 'terminating' })),
  },
}));
vi.mock('@/lib/tracing/socket', () => ({
  tracingRealtime: { onSpanUpsert: (_fn: any) => () => {} },
}));

import { NodeTracingSidebar } from '../NodeTracingSidebar';
import { graph as api } from '@/api/modules/graph';

describe('NodeObsSidebar terminate UI behavior', () => {
  it('renders active runs, disables button during terminate, optimistic state and refresh', async () => {
    const oldConfirm = window.confirm;
    // @ts-expect-error test override
    window.confirm = () => true;
    const node: any = { id: 'agent-1', data: { template: 'agent' } };
    const { TracingProvider } = await import('../../../../../tracing-ui/src/context/TracingProvider');
    await act(async () => { render(<MemoryRouter><TracingProvider serverUrl="http://localhost:4319"><NodeTracingSidebar node={node} /></TracingProvider></MemoryRouter>); });
    expect(await screen.findByText('Active Runs')).toBeInTheDocument();
    const btn = await screen.findByText('Terminate');
    expect(btn).toBeEnabled();
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const badge = await screen.findByText('terminating');
    expect(badge).toBeInTheDocument();
    expect(btn).toBeDisabled();
    // Next poll should run again (timer); simulate immediate refresh
    (api.listNodeRuns as any).mockResolvedValueOnce({ items: [] });
    window.confirm = oldConfirm;
  });
});
