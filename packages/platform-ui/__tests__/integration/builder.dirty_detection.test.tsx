import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// Shared store for hoisted mocks
(globalThis as any).__graphTest = { posts: 0, saved: null };
vi.mock('@/api/modules/graph', () => ({
  graph: {
    getTemplates: vi.fn(async () => [{ name: 'mock', title: 'Mock', kind: 'tool', sourcePorts: ['out'], targetPorts: ['in'] }]),
    getFullGraph: vi.fn(async () => ({
      name: 'g',
      version: 1,
      nodes: [
        { id: 'n1', template: 'mock', config: {}, position: { x: 10, y: 10 } },
        { id: 'n2', template: 'mock', config: {}, position: { x: 100, y: 10 } },
      ],
      edges: [],
    })),
    saveFullGraph: vi.fn(async (body: any) => { (globalThis as any).__graphTest.posts += 1; (globalThis as any).__graphTest.saved = body; return { version: Date.now() } as any; }),
  },
}));
import React, { useEffect } from 'react';
import { act, render, waitFor, screen } from '@testing-library/react';
import { TestProviders } from './testUtils';
import { useBuilderState } from '../../src/builder/hooks/useBuilderState';
import type { EdgeRemoveChange, NodePositionChange, NodeRemoveChange, NodeSelectionChange, OnConnect } from 'reactflow';

function Harness({ expose, debounceMs = 80 }: { expose: (api: ReturnType<typeof useBuilderState>) => void; debounceMs?: number }) {
  const api = useBuilderState('http://localhost:3010', { debounceMs });
  useEffect(() => {
    expose(api);
  }, [api, expose]);
  return <div data-testid="status">{api.loading ? 'loading' : 'ready'}</div>;
}

describe('Builder dirty detection for graph edits', () => {
  beforeAll(() => { (globalThis as any).__graphTest.posts = 0; (globalThis as any).__graphTest.saved = null; });
  afterEach(() => { vi.useRealTimers(); });
  afterAll(() => {});

  function getPosts() { return (globalThis as any).__graphTest.posts as number; }

  it('ignores selection-only changes (no autosave/version bump)', async () => {
    (globalThis as any).__graphTest.posts = 0;
    let api: ReturnType<typeof useBuilderState> | null = null;

    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Switch to fake timers after hydration only
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.now() });

    // programmatic selection should not trigger dirty
    const change: NodeSelectionChange = { id: 'n1', type: 'select', selected: true };
    await act(async () => {
      api!.onNodesChange([change]);
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    expect(getPosts()).toBe(0);
  });

  it('position drag end with no delta is not dirty; real move is dirty', async () => {
    (globalThis as any).__graphTest.posts = 0;
    let api: ReturnType<typeof useBuilderState> | null = null;

    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.now() });

    // Drag end with no delta
    // Simulate drag start then drag end with same position (no delta)
    const dragStart: NodePositionChange = { id: 'n1', type: 'position', dragging: true };
    const noMove: NodePositionChange = {
      id: 'n1',
      type: 'position',
      dragging: false,
      position: { x: 10, y: 10 },
      // Include absolute as some RF versions use this when applying
      // position changes internally
      // @ts-expect-error positionAbsolute exists at runtime in RF but is not typed
      positionAbsolute: { x: 10, y: 10 },
    };
    await act(async () => {
      api!.onNodesChange([dragStart]);
      api!.onNodesChange([noMove]);
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    expect(getPosts()).toBe(0);

    // Real move
    const dragStart2: NodePositionChange = { id: 'n1', type: 'position', dragging: true };
    const move: NodePositionChange = {
      id: 'n1',
      type: 'position',
      dragging: false,
      position: { x: 20, y: 10 },
      // @ts-expect-error positionAbsolute exists at runtime in RF but is not typed
      positionAbsolute: { x: 20, y: 10 },
    };
    await act(async () => {
      api!.onNodesChange([dragStart2]);
      api!.onNodesChange([move]);
    });
    // Sanity check: position actually changed
    const nodeAfterMove = api!.nodes.find((n) => n.id === 'n1');
    expect(nodeAfterMove?.position.x).toBe(20);
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    await waitFor(() => expect(getPosts()).toBe(1));
  });

  it('node and edge add/remove mark dirty', async () => {
    (globalThis as any).__graphTest.posts = 0;
    let api: ReturnType<typeof useBuilderState> | null = null;

    render(
      <TestProviders>
        <Harness expose={(a) => (api = a)} />
      </TestProviders>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.now() });

    // Node add
    await act(async () => {
      api!.addNode('mock', { x: 0, y: 0 });
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    await waitFor(() => expect(getPosts()).toBe(1));

    // Edge add via valid connection
    const conn: Parameters<OnConnect>[0] = { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' };
    await act(async () => {
      api!.onConnect(conn);
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    await waitFor(() => expect(getPosts()).toBe(2));

    // Edge remove
    const edgeId = 'n1-out__n2-in';
    const erem: EdgeRemoveChange = { id: edgeId, type: 'remove' };
    await act(async () => {
      api!.onEdgesChange([erem]);
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    await waitFor(() => expect(getPosts()).toBe(3));

    // Node remove
    const nrem: NodeRemoveChange = { id: 'n1', type: 'remove' };
    await act(async () => {
      api!.onNodesChange([nrem]);
    });
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    await waitFor(() => expect(getPosts()).toBe(4));
  });
});
