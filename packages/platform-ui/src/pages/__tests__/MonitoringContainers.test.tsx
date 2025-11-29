import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MonitoringContainers } from '../MonitoringContainers';
import { TooltipProvider } from '@agyn/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ContainerItem } from '@/api/modules/containers';
import type ContainersScreenComponent from '@/components/screens/ContainersScreen';
import type { Container as ScreenContainer } from '@/components/screens/ContainersScreen';

type ContainersScreenProps = React.ComponentProps<typeof ContainersScreenComponent>;
let latestContainersScreenProps: ContainersScreenProps | null = null;
let lastUseContainersArgs: { status: unknown; sortBy: unknown; sortDir: unknown; threadId: unknown } | null = null;

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

let containersScreenMock: ReturnType<typeof vi.fn> | undefined;

const getContainersScreenMock = () => {
  if (!containersScreenMock) {
    throw new Error('containersScreenMock not initialized');
  }
  return containersScreenMock;
};

vi.mock('@/components/screens/ContainersScreen', () => {
  const mocked = (props: ContainersScreenProps) => getContainersScreenMock()(props);
  return {
    __esModule: true,
    default: mocked,
  };
});

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

const useContainersMock = vi.fn();
const mutateSessionMock = vi.fn();
const resetSessionMock = vi.fn();
const createSessionHookMock = vi.fn(() => ({ mutateAsync: mutateSessionMock, status: 'idle', reset: resetSessionMock }));

vi.mock('@/api/hooks/containers', () => ({
  useContainers: (...args: unknown[]) => useContainersMock(...args),
  useCreateContainerTerminalSession: (...args: unknown[]) => createSessionHookMock(...args),
}));

function renderPage() {
  return render(
    <TooltipProvider>
      <MonitoringContainers />
    </TooltipProvider>
  );
}

describe('MonitoringContainers page', () => {
  beforeEach(() => {
    containersScreenMock = vi.fn((props: ContainersScreenProps) => {
      latestContainersScreenProps = props;
      return <div data-testid="containers-screen-mock" />;
    });

    vi.useFakeTimers();
    terminalOpenMock.mockClear();
    terminalDisposeMock.mockClear();
    terminalWriteMock.mockClear();
    terminalWritelnMock.mockClear();
    navigateMock.mockReset();
    mutateSessionMock.mockReset();
    resetSessionMock.mockReset();
    createSessionHookMock.mockReturnValue({ mutateAsync: mutateSessionMock, status: 'idle', reset: resetSessionMock });
    latestContainersScreenProps = null;
    lastUseContainersArgs = null;

    const timestamp = '2024-01-01T00:00:00.000Z';
    const baseData = {
      items: [
        {
          containerId: 'abcdef1234567890',
          threadId: '11111111-1111-1111-1111-111111111111',
          image: 'workspace:latest',
          name: 'workspace-main',
          status: 'running',
          startedAt: timestamp,
          lastUsedAt: timestamp,
          killAfterAt: null,
          role: 'workspace',
          sidecars: [
            { containerId: 'dind1234567890', role: 'dind', image: 'dind:latest', status: 'terminating', name: 'dind-helper' },
          ],
          mounts: [
            { source: 'ha_ws_thread', destination: '/workspace' },
          ],
        },
      ],
    } satisfies { items: ContainerItem[] };

    const baseResult = {
      data: baseData,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } satisfies Partial<UseQueryResult<{ items: ContainerItem[] }, Error>>;

    useContainersMock.mockImplementation((status?: string, sortBy?: string, sortDir?: 'asc' | 'desc', threadId?: string) => {
      lastUseContainersArgs = { status, sortBy, sortDir, threadId };
      return baseResult as UseQueryResult<{ items: ContainerItem[] }, Error>;
    });

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
  });

  afterEach(() => {
    vi.useRealTimers();
    useContainersMock.mockReset();
    createSessionHookMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('maps API data and renders ContainersScreen', () => {
    renderPage();

    expect(lastUseContainersArgs).toEqual({ status: 'all', sortBy: 'lastUsedAt', sortDir: 'desc', threadId: undefined });
    expect(getContainersScreenMock()).toHaveBeenCalledTimes(1);
    expect(latestContainersScreenProps).not.toBeNull();

    const props = latestContainersScreenProps as ContainersScreenProps;
    expect(props.containers).toHaveLength(2);

    const [workspace, sidecar] = props.containers as ScreenContainer[];
    expect(workspace).toMatchObject({
      id: 'abcdef1234567890',
      containerId: 'abcdef1234567890',
      role: 'workspace',
      status: 'running',
      name: 'workspace-main',
      volumes: ['ha_ws_thread → /workspace'],
    });
    expect(workspace.parentId).toBeUndefined();
    expect(sidecar).toMatchObject({
      id: 'dind1234567890',
      containerId: 'dind1234567890',
      role: 'dind',
      status: 'stopping',
      parentId: 'abcdef1234567890',
      name: 'dind-helper',
      volumes: [],
    });
  });

  it('navigates to thread when view handler is used', () => {
    renderPage();
    const props = latestContainersScreenProps as ContainersScreenProps;
    act(() => {
      props.onViewThread?.('11111111-1111-1111-1111-111111111111');
    });
    expect(navigateMock).toHaveBeenCalledWith('/agents/threads/11111111-1111-1111-1111-111111111111');
  });

  it('opens terminal dialog and requests session creation', async () => {
    mutateSessionMock.mockResolvedValue({
      sessionId: 'session-1',
      wsUrl: 'wss://example/ws',
      expiresAt: '2024-01-01T01:00:00.000Z',
      negotiated: {
        cols: 80,
        rows: 24,
        shell: '/bin/bash',
      },
    });

    renderPage();
    const props = latestContainersScreenProps as ContainersScreenProps;

    await act(async () => {
      props.onOpenTerminal?.('abcdef1234567890');
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mutateSessionMock).toHaveBeenCalledWith({ containerId: 'abcdef1234567890' });
    expect(screen.getByText('workspace-main')).toBeTruthy();
    expect(screen.getByTestId('terminal-view')).toBeTruthy();
    expect(terminalOpenMock).toHaveBeenCalled();
  });

  it('renders error state with retry control when query fails without data', () => {
    const refetchMock = vi.fn();
    useContainersMock.mockImplementation(() => {
      lastUseContainersArgs = { status: 'all', sortBy: 'lastUsedAt', sortDir: 'desc', threadId: undefined };
      const result = {
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: new Error('containers failed'),
        refetch: refetchMock,
      } satisfies Partial<UseQueryResult<{ items: ContainerItem[] }, Error>>;
      return result as UseQueryResult<{ items: ContainerItem[] }, Error>;
    });

    renderPage();

    expect(screen.getByText('containers failed')).toBeTruthy();
    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);
    expect(refetchMock).toHaveBeenCalled();
    expect(getContainersScreenMock()).not.toHaveBeenCalled();
  });
});
