import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NodeDetailsPanel from '../NodeDetailsPanel';

// No templates provider mock needed; actions and badges are driven by status alone

let mockStatus: any = { isPaused: false, provisionStatus: { state: 'not_ready' } };
let mockMutate = vi.fn();

vi.mock('../../../lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: mockStatus }),
  useNodeAction: () => ({ mutate: (...args: any[]) => mockMutate(...args) }),
}));

describe('NodeDetailsPanel', () => {
  beforeEach(() => {
    mockStatus = { isPaused: false, provisionStatus: { state: 'not_ready' } };
    mockMutate = vi.fn();
  });

  const renderPanel = (props: any = {}) => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <NodeDetailsPanel nodeId="n1" templateName="tmpl" {...props} />
      </QueryClientProvider>,
    );
  };

  it('renders title and chips', () => {
    renderPanel();
    expect(screen.getByText(/Node n1/)).toBeInTheDocument();
    expect(screen.getByText(/Template:/)).toBeInTheDocument();
    expect(screen.getByText('not_ready')).toBeInTheDocument();
  });

  it('enables Provision on not_ready and calls provision', () => {
    mockStatus = { isPaused: false, provisionStatus: { state: 'not_ready' } };
    renderPanel();
    const start = screen.getByText('Provision');
    expect(start).not.toBeDisabled();
    fireEvent.click(start);
    expect(mockMutate).toHaveBeenCalledWith('provision');
  });

  // Pause/Resume removed; Start/Stop only per server API alignment

  it('enables Deprovision when ready', () => {
    mockStatus = { isPaused: false, provisionStatus: { state: 'ready' } };
    renderPanel();
    const stop = screen.getByText('Deprovision');
    expect(stop).not.toBeDisabled();
    fireEvent.click(stop);
    expect(mockMutate).toHaveBeenCalledWith('deprovision');
  });
});
