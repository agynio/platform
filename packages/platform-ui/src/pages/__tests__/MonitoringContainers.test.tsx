import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MonitoringContainers } from '../MonitoringContainers';
import { TooltipProvider } from '@agyn/ui';
import { MemoryRouter } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ContainerItem } from '@/api/modules/containers';

// Mock useContainers hook to control data and capture threadId param
let lastThreadId: string | undefined = undefined;
vi.mock('@/api/hooks/containers', () => {
  return {
    useContainers: vi.fn((_status: string = 'running', _sortBy: string = 'lastUsedAt', _sortDir: 'desc' | 'asc' = 'desc', threadId?: string) => {
      lastThreadId = threadId;
      const result = {
        data: {
          items: [
            {
              containerId: 'abcdef1234567890',
              threadId: '11111111-1111-1111-1111-111111111111',
              image: 'workspace:latest',
              status: 'running',
              startedAt: new Date().toISOString(),
              lastUsedAt: new Date().toISOString(),
              killAfterAt: null,
              role: 'workspace',
              sidecars: [
                { containerId: 'dind1234567890', role: 'dind', image: 'dind:latest', status: 'running' },
              ],
              mounts: [
                { source: 'ha_ws_thread', destination: '/workspace' },
              ],
            },
          ],
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } satisfies Partial<UseQueryResult<{ items: ContainerItem[] }, Error>>;
      return result as UseQueryResult<{ items: ContainerItem[] }, Error>;
    }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/monitoring/containers' }]}>
      <TooltipProvider>
        <MonitoringContainers />
      </TooltipProvider>
    </MemoryRouter>
  );
}

describe('MonitoringContainers page', () => {
  beforeEach(() => {
    lastThreadId = undefined;
    vi.useFakeTimers();
    // Ensure clipboard exists in JSDOM
    // @ts-expect-error - define clipboard for tests
    if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('shows role column, truncated ID, and sidecars with copy actions', async () => {
    renderPage();
    // role column badge
    expect(screen.getByText('workspace')).toBeTruthy();
    // containerId truncation to first 8 chars
    expect(screen.getByText('abcdef12')).toBeTruthy();
    // sidecar badge and truncated id
    expect(screen.getByText('dind')).toBeTruthy();
    expect(screen.getByText('dind1234')).toBeTruthy();
    // mounts rendered with source and destination
    expect(screen.getByText('Mounts:')).toBeTruthy();
    expect(screen.getByText('ha_ws_thread')).toBeTruthy();
    expect(screen.getAllByText('/workspace')[0]).toBeTruthy();
    const mainCopy = screen.getByRole('button', { name: 'Copy full container id' });
    const sidecarCopy = screen.getByRole('button', { name: /Copy sidecar dind1234567890/ });
    const spy = vi.spyOn(navigator.clipboard, 'writeText');
    await act(async () => { fireEvent.click(mainCopy); });
    expect(spy).toHaveBeenCalledWith('abcdef1234567890');
    await act(async () => { fireEvent.click(sidecarCopy); });
    expect(spy).toHaveBeenCalledWith('dind1234567890');
  });

  it('filters by valid Thread ID UUID and ignores invalid input', async () => {
    renderPage();
    const input = screen.getByPlaceholderText('Filter by Thread ID (UUID)') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'not-a-uuid' } }); });
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(lastThreadId).toBeUndefined();
    // Use a valid v4 UUID: third block starts with '4'; fourth block starts with [8|9|a|b]
    const uuid = '22222222-2222-4222-8222-222222222222';
    await act(async () => { fireEvent.change(input, { target: { value: uuid } }); });
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(lastThreadId).toBe(uuid);
  });
});
