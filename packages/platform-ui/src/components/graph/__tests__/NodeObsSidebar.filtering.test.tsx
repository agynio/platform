/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NodeTracingSidebar } from '../NodeTracingSidebar';

vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({ getTemplate: (_name: string) => ({ kind: 'tool' }) }),
}));

vi.mock('@/lib/graph/hooks', () => ({
  useNodeReminders: () => ({ isLoading: false, data: { items: [] } }),
}));

const spans: any[] = [];

vi.mock('@/api/tracing', () => ({
  fetchSpansInRange: async () => spans,
}));
vi.mock('@/lib/tracing/socket', () => ({
  tracingRealtime: { onSpanUpsert: (_fn: any) => () => {} },
}));

describe('NodeObsSidebar filtering for tool spans', () => {
  const node: any = { id: 'tool-1', data: { template: 'someTool' } };

  beforeEach(() => { spans.length = 0; });

  it('does NOT include spans when only attributes.toolNodeId matches (nodeId missing)', async () => {
    spans.push({ traceId: 't1', spanId: 's1', label: 'tool:x', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call', toolNodeId: 'tool-1' } });
    spans.push({ traceId: 't2', spanId: 's2', label: 'tool:y', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call', toolNodeId: 'tool-2' } });
    const { TracingProvider } = await import('../../../../../tracing-ui/src/context/TracingProvider');
    render(<MemoryRouter><TracingProvider serverUrl="http://localhost:4319"><NodeTracingSidebar node={node} /></TracingProvider></MemoryRouter>);
    // With strict behavior, no spans should be shown because nodeId is absent
    await waitFor(() => expect(screen.getByText('No spans yet.')).toBeInTheDocument());
    expect(screen.queryByText('s1')).not.toBeInTheDocument();
    expect(screen.queryByText('s2')).not.toBeInTheDocument();
  });

  it('includes spans when nodeId equals Tool id', async () => {
    spans.push({ traceId: 't3', spanId: 's3', label: 'tool:x', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call' }, nodeId: 'tool-1' });
    spans.push({ traceId: 't4', spanId: 's4', label: 'tool:y', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call' }, nodeId: 'tool-2' });
    const { TracingProvider } = await import('../../../../../tracing-ui/src/context/TracingProvider');
    render(<MemoryRouter><TracingProvider serverUrl="http://localhost:4319"><NodeTracingSidebar node={node} /></TracingProvider></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('No spans yet.')).not.toBeInTheDocument());
    expect(screen.getByText('s3')).toBeInTheDocument();
    expect(screen.queryByText('s4')).not.toBeInTheDocument();
  });
});
