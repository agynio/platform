import React, { type ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContextItems } from '@/api/hooks/contextItems';
import { contextItems } from '@/api/modules/contextItems';
import type { ContextItem } from '@/api/types/agents';

function createContextItem(id: string): ContextItem {
  return {
    id,
    role: 'user',
    contentText: `content-${id}`,
    contentJson: null,
    metadata: null,
    sizeBytes: 128,
    createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  };
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: Number.POSITIVE_INFINITY },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useContextItems', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches context items in windows and caches results across pagination', async () => {
    const ids = Array.from({ length: 12 }, (_, index) => `ctx-${index + 1}`);
    const fetchMock = vi
      .spyOn(contextItems, 'getMany')
      .mockImplementation(async (requested) => requested.map((id) => createContextItem(id)));

    const { result } = renderHook(() => useContextItems(ids, { initialCount: 4 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.loadedCount).toBe(4);
    });
    expect(fetchMock).toHaveBeenCalledWith(ids.slice(-4));
    expect(result.current.items.map((item) => item.id)).toEqual(ids.slice(-4));

    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.loadedCount).toBe(8);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(ids.slice(-8, -4));
    expect(result.current.items.map((item) => item.id)).toEqual(ids.slice(-8));

    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.loadedCount).toBe(12);
      expect(result.current.hasMore).toBe(false);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(ids.slice(0, 4));

    act(() => {
      result.current.loadMore();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
