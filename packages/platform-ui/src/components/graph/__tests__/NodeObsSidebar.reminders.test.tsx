/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NodeTracingSidebar } from '../NodeTracingSidebar';

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

describe('NodeObsSidebar Active Reminders', () => {
  const node: any = { id: 'n1', data: { template: 'remindMeTool', config: {} } };

  it('renders Active Reminders section and items', async () => {
    render(<MemoryRouter><NodeTracingSidebar node={node} /></MemoryRouter>);
    expect(screen.getByText('Active Reminders')).toBeInTheDocument();
    expect(screen.getByText('Check back')).toBeInTheDocument();
    // Thread id appears inside an aria-label and split text; use label to assert
    expect(screen.getByLabelText('Reminder for thread t-1')).toBeInTheDocument();
  });

  it('shows error state when hook errors', async () => {
    useNodeRemindersImpl = () => ({ isLoading: false, error: new Error('boom') });
    render(<MemoryRouter><NodeTracingSidebar node={node} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
