/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeObsSidebar } from '../NodeObsSidebar';

vi.mock('../../../lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({ getTemplate: (_name: string) => ({ kind: 'tool' }) }),
}));

const hooks = {
  useNodeReminders: (_nodeId: string) => ({ isLoading: false, data: { items: [
    { id: 'r1', threadId: 't-1', note: 'Check back', at: new Date().toISOString() },
  ] } }),
};
vi.mock('../../../lib/graph/hooks', () => hooks);

vi.mock('../../../lib/obs/api', () => ({
  fetchSpansInRange: async () => ({ items: [] }),
}));
vi.mock('../../../lib/obs/socket', () => ({
  obsRealtime: { onSpanUpsert: (_fn: any) => () => {} },
}));

describe('NodeObsSidebar Active Reminders', () => {
  const node: any = { id: 'n1', data: { template: 'remindMeTool', config: {} } };

  it('renders Active Reminders section and items', async () => {
    render(<NodeObsSidebar node={node} />);
    expect(screen.getByText('Active Reminders')).toBeInTheDocument();
    expect(screen.getByText('Check back')).toBeInTheDocument();
    expect(screen.getByText('t-1')).toBeInTheDocument();
  });

  it('shows error state when hook errors', async () => {
    // swap impl to return error
    (hooks as any).useNodeReminders = () => ({ isLoading: false, error: new Error('boom') });
    render(<NodeObsSidebar node={node} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
