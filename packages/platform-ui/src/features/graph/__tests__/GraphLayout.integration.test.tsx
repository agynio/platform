import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sidebarProps: any[] = [];
const canvasSpy = vi.hoisted(() => vi.fn());

const hookMocks = vi.hoisted(() => ({
  useGraphData: vi.fn(),
  useGraphSocket: vi.fn(),
  useNodeStatus: vi.fn(),
}));

vi.mock('@/components/GraphCanvas', () => ({
  GraphCanvas: (props: unknown) => {
    canvasSpy(props);
    return <div data-testid="graph-canvas-mock" />;
  },
}));

vi.mock('@/components/NodePropertiesSidebar', () => ({
  __esModule: true,
  default: (props: unknown) => {
    sidebarProps.push(props);
    return <div data-testid="node-sidebar-mock" />;
  },
}));

vi.mock('@/features/graph/hooks/useGraphData', () => ({
  useGraphData: hookMocks.useGraphData,
}));

vi.mock('@/features/graph/hooks/useGraphSocket', () => ({
  useGraphSocket: hookMocks.useGraphSocket,
}));

vi.mock('@/features/graph/hooks/useNodeStatus', () => ({
  useNodeStatus: hookMocks.useNodeStatus,
}));

import { GraphLayout } from '@/components/agents/GraphLayout';

describe('GraphLayout', () => {
  beforeEach(() => {
    sidebarProps.length = 0;
    Object.values(hookMocks).forEach((mock) => mock.mockReset());
    canvasSpy.mockReset();
  });

  it('passes sidebar config/state and persists config updates', async () => {
    const updateNode = vi.fn();
    const applyNodeStatus = vi.fn();
    const applyNodeState = vi.fn();

    hookMocks.useGraphData.mockReturnValue({
      nodes: [
        {
          id: 'node-1',
          template: 'agent-template',
          kind: 'Agent',
          title: 'Agent Node',
          x: 0,
          y: 0,
          status: 'not_ready',
          config: { title: 'Agent Node', systemPrompt: 'You are helpful.' },
          ports: { inputs: [], outputs: [] },
        },
      ],
      edges: [],
      loading: false,
      savingState: { status: 'saved', error: null },
      savingErrorMessage: null,
      updateNode,
      applyNodeStatus,
      applyNodeState,
    });

    hookMocks.useGraphSocket.mockImplementation(({ onStatus, onState }) => {
      onStatus?.({
        nodeId: 'node-1',
        updatedAt: new Date().toISOString(),
        provisionStatus: { state: 'ready' },
        isPaused: false,
      } as any);
      onState?.({ nodeId: 'node-1', state: { foo: 'bar' } } as any);
    });

    hookMocks.useNodeStatus.mockReturnValue({ data: { provisionStatus: { state: 'ready' } } });

    const { unmount } = render(<GraphLayout />);

    await waitFor(() => expect(canvasSpy).toHaveBeenCalled());
    await waitFor(() => expect(sidebarProps.length).toBeGreaterThan(0));

    expect(hookMocks.useGraphSocket).toHaveBeenCalledWith(
      expect.objectContaining({ nodeIds: ['node-1'] }),
    );

    const sidebar = sidebarProps.at(-1) as {
      config: Record<string, unknown>;
      state: Record<string, unknown>;
      onConfigChange?: (next: Record<string, unknown>) => void;
    };

    expect(Object.keys(sidebar).sort()).toEqual(['config', 'onConfigChange', 'state']);

    expect(sidebar.config).toEqual({
      kind: 'Agent',
      title: 'Agent Node',
      systemPrompt: 'You are helpful.',
    });

    expect(sidebar.state).toEqual({ status: 'ready' });

    sidebar.onConfigChange?.({ title: 'Updated Agent', systemPrompt: 'New prompt' });

    await waitFor(() =>
      expect(updateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          config: expect.objectContaining({
            kind: 'Agent',
            title: 'Updated Agent',
            systemPrompt: 'New prompt',
          }),
          title: 'Updated Agent',
        }),
      ),
    );

    unmount();
  });
});
