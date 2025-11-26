import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGraphData } from '../useGraphData';

const apiMocks = vi.hoisted(() => ({
  fetchGraph: vi.fn(),
  fetchTemplates: vi.fn(),
  fetchNodeStatus: vi.fn(),
  saveGraph: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  graphApiService: {
    fetchGraph: apiMocks.fetchGraph,
    fetchTemplates: apiMocks.fetchTemplates,
    fetchNodeStatus: apiMocks.fetchNodeStatus,
    saveGraph: apiMocks.saveGraph,
  },
}));

const graphResponse = {
  name: 'agents',
  version: 1,
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'node-1',
      template: 'agent',
      position: { x: 10, y: 20 },
      config: { title: 'Agent One' },
    },
  ],
  edges: [],
  variables: [],
};

const templatesResponse = [
  {
    name: 'agent',
    title: 'Agent',
    kind: 'agent',
    sourcePorts: [],
    targetPorts: [],
  },
];

const statusResponse = { provisionStatus: { state: 'ready' }, isPaused: false };

describe('useGraphData', () => {
  beforeEach(() => {
    apiMocks.fetchGraph.mockResolvedValue(structuredClone(graphResponse));
    apiMocks.fetchTemplates.mockResolvedValue(structuredClone(templatesResponse));
    apiMocks.fetchNodeStatus.mockResolvedValue(structuredClone(statusResponse));
    apiMocks.saveGraph.mockResolvedValue(structuredClone(graphResponse));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('debounces saves and reports success', async () => {
    const { result } = renderHook(() => useGraphData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiMocks.fetchGraph).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    act(() => {
      result.current.updateNode('node-1', { title: 'Updated Agent' });
    });

    expect(result.current.savingState.status).toBe('saving');

    await vi.advanceTimersByTimeAsync(800);
    await act(async () => {
      await Promise.resolve();
    });

    expect(apiMocks.saveGraph).toHaveBeenCalledTimes(1);
    expect(result.current.savingState.status).toBe('saved');
    const payload = apiMocks.saveGraph.mock.calls[0]?.[0];
    expect(payload?.nodes?.[0]?.config?.title).toBe('Updated Agent');
  });

  it('surfaces save errors after debounce', async () => {
    apiMocks.saveGraph.mockRejectedValueOnce(new Error('network boom'));

    const { result } = renderHook(() => useGraphData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    act(() => {
      result.current.updateNode('node-1', { title: 'Boom' });
    });

    await vi.advanceTimersByTimeAsync(800);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.savingState.status).toBe('error');
    expect(result.current.savingErrorMessage).toContain('network boom');
  });
});
