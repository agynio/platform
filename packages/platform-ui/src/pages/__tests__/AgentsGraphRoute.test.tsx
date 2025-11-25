import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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
    GraphLayout: (props: { services: unknown }) => {
      expect(props.services).toBeDefined();
      (globalThis as { __graphMockHits?: number }).__graphMockHits =
        ((globalThis as { __graphMockHits?: number }).__graphMockHits ?? 0) + 1;
      return <div data-testid="graph-container">new graph layout</div>;
    },
  }));
  const { default: App } = await import('@/App');
  return render(
    <MemoryRouter initialEntries={['/agents/graph']}>
      <App />
    </MemoryRouter>,
  );
}

describe('Agents graph routing', () => {
  it('renders the new graph layout for /agents/graph', async () => {
    await renderGraphRoute();
    await waitFor(() => expect((globalThis as { __graphMockHits?: number }).__graphMockHits ?? 0).toBeGreaterThan(0));
  });
});
