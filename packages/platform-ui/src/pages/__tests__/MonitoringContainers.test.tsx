import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MonitoringContainers } from '../MonitoringContainers';
import { TooltipProvider } from '@agyn/ui';
import { MemoryRouter } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ContainerItem } from '@/api/modules/containers';

const terminalOpenMock = vi.fn();
const terminalDisposeMock = vi.fn();
const terminalWriteMock = vi.fn();
const terminalWritelnMock = vi.fn();

vi.mock('@xterm/xterm', () => {
  class FakeDisposable {
    dispose = vi.fn();
  }

  class FakeTerminal {
    cols = 80;
    rows = 24;
    loadAddon = vi.fn();
    open = terminalOpenMock;
    focus = vi.fn();
    dispose = terminalDisposeMock;
    write = terminalWriteMock;
    writeln = terminalWritelnMock;
    onData(_callback: (data: string) => void) {
      return new FakeDisposable();
    }
    onPaste(_callback: (data: string) => void) {
      return new FakeDisposable();
    }
    onResize(_callback: () => void) {
      return new FakeDisposable();
    }
  }

  return { Terminal: FakeTerminal };
});

vi.mock('@xterm/addon-fit', () => {
  class FakeFitAddon {
    fit = vi.fn();
    dispose = vi.fn();
  }
  return { FitAddon: FakeFitAddon };
});

vi.mock('@xterm/addon-webgl', () => {
  class FakeWebglAddon {}
  return { WebglAddon: FakeWebglAddon };
});

// Mock hooks to control data flow
const useContainersMock = vi.fn();
const mutateSessionMock = vi.fn();
const resetSessionMock = vi.fn();
const createSessionHookMock = vi.fn(() => ({ mutateAsync: mutateSessionMock, status: 'idle', reset: resetSessionMock }));

let lastThreadId: string | undefined = undefined;

vi.mock('@/api/hooks/containers', () => ({
  useContainers: (...args: unknown[]) => useContainersMock(...args),
  useCreateContainerTerminalSession: (...args: unknown[]) => createSessionHookMock(...args),
}));

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
    terminalOpenMock.mockClear();
    terminalDisposeMock.mockClear();
    terminalWriteMock.mockClear();
    terminalWritelnMock.mockClear();
    useContainersMock.mockImplementation((_status?: string, _sortBy?: string, _sortDir?: 'asc' | 'desc', threadId?: string) => {
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
    });
    mutateSessionMock.mockResolvedValue({
      sessionId: 'session-1',
      token: 'tok',
      wsUrl: '/api/containers/abcdef1234567890/terminal/ws?sessionId=session-1&token=tok',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      negotiated: { shell: '/bin/bash', cols: 120, rows: 32 },
    });
    createSessionHookMock.mockReturnValue({ mutateAsync: mutateSessionMock, status: 'idle', reset: resetSessionMock });
    // Stub WebSocket for terminal component
    class FakeWebSocket {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = FakeWebSocket.OPEN;
      url: string;
      constructor(url: string) {
        this.url = url;
      }
      send = vi.fn();
      close = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    class FakeResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver as unknown as typeof ResizeObserver);
    // Ensure clipboard exists in JSDOM
    // @ts-expect-error - define clipboard for tests
    if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    useContainersMock.mockReset();
    mutateSessionMock.mockReset();
    resetSessionMock.mockReset();
    createSessionHookMock.mockReset();
    vi.unstubAllGlobals();
  });

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
    const terminalButton = screen.getByRole('button', { name: 'Open terminal' });
    expect(terminalButton).toBeEnabled();
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

  it('opens terminal dialog and requests session creation', async () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'Open terminal' });
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      // allow mutation promise to resolve
      await Promise.resolve();
    });
    expect(mutateSessionMock).toHaveBeenCalledWith({ containerId: 'abcdef1234567890' });
    expect(screen.getByText(/Terminal for abcdef123456/)).toBeTruthy();
    expect(screen.getByTestId('terminal-view')).toBeTruthy();
    expect(terminalOpenMock).toHaveBeenCalled();
  });
});
