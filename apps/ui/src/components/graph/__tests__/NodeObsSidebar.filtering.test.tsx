/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NodeObsSidebar } from '../NodeObsSidebar';

vi.mock('../../../lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({ getTemplate: (_name: string) => ({ kind: 'tool' }) }),
}));

vi.mock('../../../lib/graph/hooks', () => ({
  useNodeReminders: () => ({ isLoading: false, data: { items: [] } }),
}));

const spans: any[] = [];

vi.mock('../../../lib/obs/api', () => ({
  fetchSpansInRange: async () => ({ items: spans }),
}));
vi.mock('../../../lib/obs/socket', () => ({
  obsRealtime: { onSpanUpsert: (_fn: any) => () => {} },
}));

describe('NodeObsSidebar filtering for tool spans', () => {
  const node: any = { id: 'tool-1', data: { template: 'someTool' } };

  beforeEach(() => { spans.length = 0; });

  it('does NOT include spans when only attributes.toolNodeId matches (nodeId missing)', async () => {
    spans.push({ traceId: 't1', spanId: 's1', label: 'tool:x', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call', toolNodeId: 'tool-1' } });
    spans.push({ traceId: 't2', spanId: 's2', label: 'tool:y', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call', toolNodeId: 'tool-2' } });
    render(<NodeObsSidebar node={node} />);
    // With strict behavior, no spans should be shown because nodeId is absent
    await waitFor(() => expect(screen.getByText('No spans yet.')).toBeInTheDocument());
    expect(screen.queryByText('s1')).not.toBeInTheDocument();
    expect(screen.queryByText('s2')).not.toBeInTheDocument();
  });

  it('includes spans when nodeId equals Tool id', async () => {
    spans.push({ traceId: 't3', spanId: 's3', label: 'tool:x', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call' }, nodeId: 'tool-1' });
    spans.push({ traceId: 't4', spanId: 's4', label: 'tool:y', status: 'ok', startTime: 'n', completed: true, lastUpdate: 'n', attributes: { kind: 'tool_call' }, nodeId: 'tool-2' });
    render(<NodeObsSidebar node={node} />);
    await waitFor(() => expect(screen.queryByText('No spans yet.')).not.toBeInTheDocument());
    expect(screen.getByText('s3')).toBeInTheDocument();
    expect(screen.queryByText('s4')).not.toBeInTheDocument();
  });
});
