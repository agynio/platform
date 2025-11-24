import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const graphHooksMocks = vi.hoisted(() => ({
  useGraphData: vi.fn(() => ({
    nodes: [],
    loading: false,
    savingState: { status: 'saved' as const, error: null },
    savingErrorMessage: null,
    updateNode: vi.fn(),
    applyNodeStatus: vi.fn(),
    applyNodeState: vi.fn(),
  })),
  useGraphSocket: vi.fn(),
}));

let getContextSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeAll(() => {
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({} as CanvasRenderingContext2D);
});

afterAll(() => {
  getContextSpy?.mockRestore();
});

async function renderGraphRoute() {
  vi.resetModules();
  delete (globalThis as { __graphMockHits?: number }).__graphMockHits;
  vi.doMock('@/components/agents/GraphLayout', () => ({
    __esModule: true,
    GraphLayout: () => {
      (globalThis as { __graphMockHits?: number }).__graphMockHits =
        ((globalThis as { __graphMockHits?: number }).__graphMockHits ?? 0) + 1;
      return <div data-testid="graph-container">new graph layout</div>;
    },
  }));
  vi.doMock('@/features/graph/hooks/useGraphData', () => ({
    __esModule: true,
    useGraphData: graphHooksMocks.useGraphData,
  }));
  vi.doMock('@/features/graph/hooks/useGraphSocket', () => ({
    __esModule: true,
    useGraphSocket: graphHooksMocks.useGraphSocket,
  }));
  const { default: App } = await import('@/App');
  return render(
    <MemoryRouter initialEntries={['/agents/graph']}>
      <App />
    </MemoryRouter>,
  );
}

describe('Agents graph routing', () => {
  beforeEach(() => {
    graphHooksMocks.useGraphData.mockClear();
    graphHooksMocks.useGraphSocket.mockClear();
  });

  it('renders the new graph layout for /agents/graph', async () => {
    await renderGraphRoute();
    await waitFor(() => expect((globalThis as { __graphMockHits?: number }).__graphMockHits ?? 0).toBeGreaterThan(0));
    expect(graphHooksMocks.useGraphData).toHaveBeenCalled();
    expect(graphHooksMocks.useGraphSocket).toHaveBeenCalled();
  });
});
