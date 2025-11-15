/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThreadContainers } from '../threads';

const reconnectHandlers: Set<() => void> = new Set();

vi.mock('@/api/modules/containers', () => ({
  listContainers: vi.fn(async () => ({ items: [] })),
}));

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: {
    onReconnected: vi.fn((handler: () => void) => {
      reconnectHandlers.add(handler);
      return () => reconnectHandlers.delete(handler);
    }),
  },
}));

const { listContainers } = await import('@/api/modules/containers');
const mockedListContainers = vi.mocked(listContainers);
const validThreadId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper, client };
}

describe('useThreadContainers', () => {
  beforeEach(() => {
    reconnectHandlers.clear();
    vi.clearAllMocks();
  });

  it('skips fetching when disabled or thread missing', async () => {
    const { wrapper } = createWrapper();
    const { result: noThread } = renderHook(() => useThreadContainers(undefined, true), { wrapper });
    expect(noThread.current.isLoading).toBe(false);
    expect(mockedListContainers).not.toHaveBeenCalled();

    const { result: disabled } = renderHook(() => useThreadContainers(validThreadId, false), { wrapper });
    expect(disabled.current.isLoading).toBe(false);
    expect(mockedListContainers).not.toHaveBeenCalled();

    const { result: invalid } = renderHook(() => useThreadContainers('not-a-uuid', true), { wrapper });
    expect(invalid.current.isLoading).toBe(false);
    expect(mockedListContainers).not.toHaveBeenCalled();
  });

  it('fetches running containers when enabled', async () => {
    mockedListContainers.mockResolvedValueOnce({ items: [] });
    const { wrapper } = createWrapper();
    renderHook(() => useThreadContainers(validThreadId, true), { wrapper });

    await waitFor(() => expect(mockedListContainers).toHaveBeenCalledTimes(1));
    expect(mockedListContainers).toHaveBeenCalledWith({ status: 'running', sortBy: 'lastUsedAt', sortDir: 'desc', threadId: validThreadId });
  });

  it('invalidates on socket reconnect', async () => {
    mockedListContainers.mockResolvedValue({ items: [] });
    const { wrapper, client } = createWrapper();
    renderHook(() => useThreadContainers(validThreadId, true), { wrapper });

    await waitFor(() => expect(mockedListContainers).toHaveBeenCalledTimes(1));

    for (const handler of Array.from(reconnectHandlers)) handler();

    await waitFor(() => expect(mockedListContainers).toHaveBeenCalledTimes(2));
    client.clear();
  });
});
