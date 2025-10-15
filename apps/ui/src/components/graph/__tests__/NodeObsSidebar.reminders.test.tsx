/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeObsSidebar } from '../NodeObsSidebar';

vi.mock('../../../lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({ getTemplate: (_name: string) => ({ kind: 'tool' }) }),
}));

// Provide a mutable implementation we can swap per-test
let useNodeRemindersImpl: any = (_nodeId: string) => ({ isLoading: false, data: { items: [
  { id: 'r1', threadId: 't-1', note: 'Check back', at: new Date().toISOString() },
] } });
vi.mock('../../../lib/graph/hooks', () => ({
  useNodeReminders: (...args: any[]) => useNodeRemindersImpl(...args),
}));

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
    // Thread id appears inside an aria-label and split text; use label to assert
    expect(screen.getByLabelText('Reminder for thread t-1')).toBeInTheDocument();
  });

  it('shows error state when hook errors', async () => {
    useNodeRemindersImpl = () => ({ isLoading: false, error: new Error('boom') });
    render(<NodeObsSidebar node={node} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
