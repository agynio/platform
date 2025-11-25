import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GraphNodeConfig } from '@/features/graph/types';

const hookMocks = vi.hoisted(() => ({
  useNodeAction: vi.fn(),
  useMcpNodeState: vi.fn(),
}));

const getConfigViewMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/graph/hooks', () => ({
  useNodeAction: hookMocks.useNodeAction,
  useMcpNodeState: hookMocks.useMcpNodeState,
}));

vi.mock('@/components/configViews/registry', () => ({
  getConfigView: getConfigViewMock,
}));

import NodePropertiesSidebar from '../NodePropertiesSidebar';

function createNode(overrides: Partial<GraphNodeConfig> = {}): GraphNodeConfig {
  return {
    id: 'node-1',
    kind: 'Agent',
    template: 'agent-template',
    title: 'Sample Node',
    x: 0,
    y: 0,
    status: 'not_ready',
    config: { title: 'Sample Node', foo: 'bar' },
    state: {},
    ports: { inputs: [], outputs: [] },
    runtime: { provisionStatus: { state: 'not_ready' }, isPaused: false },
    capabilities: { provisionable: true },
    ...overrides,
  };
}

describe('NodePropertiesSidebar', () => {
  beforeEach(() => {
    hookMocks.useNodeAction.mockReset();
    hookMocks.useMcpNodeState.mockReset();
    getConfigViewMock.mockReset();
    hookMocks.useNodeAction.mockReturnValue({ mutate: vi.fn(), isPending: false });
    hookMocks.useMcpNodeState.mockReturnValue({ tools: [], enabledTools: [], setEnabledTools: vi.fn(), isLoading: false });
    getConfigViewMock.mockReturnValue(null);
  });

  it('updates title and config when input changes', () => {
    const onUpdate = vi.fn();
    render(<NodePropertiesSidebar node={createNode()} onUpdate={onUpdate} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated Title' } });

    expect(onUpdate).toHaveBeenCalledWith({ title: 'Updated Title', config: { title: 'Updated Title', foo: 'bar' } });
  });

  it('triggers provision action with optimistic update and revert on error', () => {
    let capturedOptions: { onError?: () => void } | undefined;
    const mutate = vi.fn((action: 'provision' | 'deprovision', options?: { onError?: () => void }) => {
      capturedOptions = options;
    });
    hookMocks.useNodeAction.mockReturnValue({ mutate, isPending: false });
    const onUpdate = vi.fn();

    render(<NodePropertiesSidebar node={createNode()} onUpdate={onUpdate} />);

    const provisionButton = screen.getByRole('button', { name: /^provision$/i });
    fireEvent.click(provisionButton);

    expect(mutate).toHaveBeenCalledWith('provision', expect.any(Object));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'provisioning' }));

    capturedOptions?.onError?.();

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'not_ready' }));
  });

  it('renders MCP tools and toggles enabled state', () => {
    const setEnabledTools = vi.fn();
    hookMocks.useMcpNodeState.mockReturnValue({
      tools: [{ name: 'toolA', title: 'Tool A', description: 'desc' }],
      enabledTools: ['toolA'],
      setEnabledTools,
      isLoading: false,
    });

    const node = createNode({ kind: 'MCP', capabilities: { provisionable: true }, runtime: undefined });
    render(<NodePropertiesSidebar node={node} onUpdate={vi.fn()} />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(setEnabledTools).toHaveBeenCalledWith([]);
  });
});
