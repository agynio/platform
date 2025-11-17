import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { ContainerTerminalDialog } from '../ContainerTerminalDialog';
import { toWsUrl } from '../toWsUrl';
import type { ContainerItem, ContainerTerminalSessionResponse } from '@/api/modules/containers';

const terminalOpenMock = vi.fn();
const terminalDisposeMock = vi.fn();
const terminalWriteMock = vi.fn();
const terminalWritelnMock = vi.fn();
let terminalDataHandler: ((data: string) => void) | null = null;

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
    onData(callback: (data: string) => void) {
      terminalDataHandler = callback;
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

const mutateAsyncMock = vi.fn<
  [params: { containerId: string }],
  Promise<ContainerTerminalSessionResponse>
>();
const resetMock = vi.fn();
let mutationStatus: 'idle' | 'pending' | 'error' = 'idle';

const webSocketSendMock = vi.fn<(payload: string) => void>();
const webSocketCloseMock = vi.fn();

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  url: string;

  constructor(url: string) {
    super();
    this.url = url;
    webSocketInstances.push(this);
  }

  send(payload: string) {
    webSocketSendMock(payload);
  }

  close() {
    webSocketCloseMock();
    this.readyState = FakeWebSocket.CLOSED;
  }
}

const webSocketInstances: FakeWebSocket[] = [];

const OriginalWebSocket = globalThis.WebSocket;

vi.mock('@/api/hooks/containers', () => ({
  useCreateContainerTerminalSession: () => ({
    mutateAsync: mutateAsyncMock,
    status: mutationStatus,
    reset: resetMock,
  }),
}));

const container: ContainerItem = {
  containerId: 'container-123456',
  threadId: '11111111-1111-1111-1111-111111111111',
  image: 'workspace:latest',
  status: 'running',
  startedAt: new Date().toISOString(),
  lastUsedAt: new Date().toISOString(),
  killAfterAt: null,
  role: 'workspace',
  sidecars: [],
  mounts: [],
};

const sessionResponse: ContainerTerminalSessionResponse = {
  sessionId: 'session-abc',
  token: 'token-abc',
  wsUrl: '/ws',
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  negotiated: { cols: 120, rows: 32, shell: '/bin/bash' },
};

describe('ContainerTerminalDialog stability', () => {
  beforeAll(() => {
    (globalThis as any).WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterAll(() => {
    (globalThis as any).WebSocket = OriginalWebSocket;
  });

  beforeEach(() => {
    mutateAsyncMock.mockReset();
    resetMock.mockReset();
    terminalOpenMock.mockClear();
    terminalDisposeMock.mockClear();
    terminalWriteMock.mockClear();
    terminalWritelnMock.mockClear();
    terminalDataHandler = null;
    webSocketInstances.length = 0;
    webSocketSendMock.mockReset();
    webSocketCloseMock.mockReset();
    mutationStatus = 'idle';
    mutateAsyncMock.mockResolvedValue(sessionResponse);
  });

  it('does not loop renders across open, close, and retry flows', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ContainerTerminalDialog container={container} open onClose={() => {}} />
    );

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));

    rerender(<ContainerTerminalDialog container={container} open={false} onClose={() => {}} />);
    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(1));

    rerender(<ContainerTerminalDialog container={container} open onClose={() => {}} />);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(2));

    rerender(<ContainerTerminalDialog container={container} open={false} onClose={() => {}} />);
    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(2));

    mutateAsyncMock.mockRejectedValueOnce(new Error('session failed'));
    rerender(<ContainerTerminalDialog container={container} open onClose={() => {}} />);
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument());

    mutateAsyncMock.mockResolvedValueOnce(sessionResponse);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(3));

    const depthErrors = consoleErrorSpy.mock.calls.filter(([message]) =>
      typeof message === 'string' && message.includes('Maximum update depth exceeded')
    );
    expect(depthErrors).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it('buffers input until websocket opens and forwards keystrokes once focused', async () => {
    render(<ContainerTerminalDialog container={container} open onClose={() => {}} />);

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(webSocketInstances).toHaveLength(1));
    await waitFor(() => expect(terminalOpenMock).toHaveBeenCalledTimes(1));

    const socket = webSocketInstances[0];
    const host = await screen.findByTestId('terminal-view');

    expect(host).toHaveAttribute('tabindex', '0');
    await waitFor(() => expect(host).toHaveFocus());

    expect(terminalDataHandler).toBeDefined();

    const getSentInputs = () =>
      webSocketSendMock.mock.calls
        .map(([payload]) => {
          if (typeof payload !== 'string') return null;
          try {
            return JSON.parse(payload) as { type?: string; data?: string };
          } catch {
            return null;
          }
        })
        .filter((message): message is { type: string; data: string } => Boolean(message && message.type === 'input' && typeof message.data === 'string'))
        .map((message) => message.data);

    terminalDataHandler?.('queued command');
    expect(getSentInputs()).toHaveLength(0);

    socket.readyState = FakeWebSocket.OPEN;
    socket.dispatchEvent(new Event('open'));

    await waitFor(() => {
      expect(getSentInputs()).toContain('queued command');
    });

    fireEvent.click(host);
    terminalDataHandler?.('live command');

    await waitFor(() => {
      expect(getSentInputs()).toContain('live command');
    });
  });
});

describe('toWsUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses API base env for relative paths', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3010');
    const url = toWsUrl('/api/containers/terminal/session');
    expect(url).toBe('ws://localhost:3010/api/containers/terminal/session');
  });

  it('returns absolute websocket URLs unchanged', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:9999');
    const url = toWsUrl('wss://external.example.com/ws');
    expect(url).toBe('wss://external.example.com/ws');
  });
});
