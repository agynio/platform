import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContainerActivityTimeline } from '../ContainerActivityTimeline';
import { useContainerEvents } from '@/api/hooks/containerEvents';

vi.mock('@/api/hooks/containerEvents', () => ({
  useContainerEvents: vi.fn(),
}));

const useContainerEventsMock = vi.mocked(useContainerEvents);

describe('ContainerActivityTimeline', () => {
  beforeEach(() => {
    useContainerEventsMock.mockReset();
  });

  it('renders events and loads older pages', () => {
    const fetchNextPage = vi.fn();
    useContainerEventsMock.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: 'evt-1',
                containerId: 'cid-1',
                eventType: 'start',
                exitCode: null,
                signal: null,
                health: 'healthy',
                reason: 'Container started',
                message: 'Started successfully',
                createdAt: '2024-01-01T00:00:00.000Z',
              },
            ],
            page: { limit: 50, order: 'desc', nextBefore: '2024-01-01T00:00:00.000Z|evt-1', nextAfter: null },
          },
        ],
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useContainerEvents>);

    render(<ContainerActivityTimeline containerId="cid-1" />);

    expect(screen.getByText('Container started')).toBeInTheDocument();
    expect(screen.getByText(/2024-01-01 00:00:00/)).toBeInTheDocument();
    expect(screen.getByText(/Started successfully/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Load older activity/i }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows retry control on error', () => {
    const refetch = vi.fn();
    useContainerEventsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch,
    } as unknown as ReturnType<typeof useContainerEvents>);

    render(<ContainerActivityTimeline containerId="cid-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
