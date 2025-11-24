import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const graphHooksMocks = vi.hoisted(() => ({
  useGraphData: () => ({
    nodes: [],
    loading: false,
    savingState: { status: 'saved' as const },
    savingErrorMessage: null,
    updateNode: vi.fn(),
    applyNodeStatus: vi.fn(),
    applyNodeState: vi.fn(),
  }),
  useGraphSocket: vi.fn(),
}));

const originalFlag = import.meta.env.VITE_ENABLE_NEW_GRAPH;
let getContextSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeAll(() => {
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({} as CanvasRenderingContext2D);
});

afterAll(() => {
  (import.meta as any).env.VITE_ENABLE_NEW_GRAPH = originalFlag;
  vi.unstubAllEnvs();
  getContextSpy?.mockRestore();
});

async function renderWithFlag(flag: string) {
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_NEW_GRAPH', flag);
  (import.meta as any).env.VITE_ENABLE_NEW_GRAPH = flag;
  delete (globalThis as { __graphMockHits?: number }).__graphMockHits;
  vi.doMock('@/builder/AgentBuilder', () => ({
    __esModule: true,
    AgentBuilder: () => <div data-testid="builder-page">legacy builder</div>,
  }));
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
    <MemoryRouter initialEntries={['/agents/graph2']}>
      <App />
    </MemoryRouter>,
  );
}

describe('Agents graph routing flag', () => {
  it('renders new graph container when flag enabled', async () => {
    await renderWithFlag('true');
    await waitFor(() => expect((globalThis as { __graphMockHits?: number }).__graphMockHits ?? 0).toBeGreaterThan(0));
    expect(screen.queryByTestId('builder-page')).not.toBeInTheDocument();
  });

  it('falls back to legacy builder when flag disabled', async () => {
    await renderWithFlag('false');
    expect(await screen.findByTestId('builder-page')).toBeInTheDocument();
    expect((globalThis as { __graphMockHits?: number }).__graphMockHits ?? 0).toBe(0);
  });
});
