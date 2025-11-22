import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const noop = () => {};

vi.mock('@/lib/graph/socket', () => {
  const listener = () => vi.fn(() => noop);
  return {
    graphSocket: {
      connect: vi.fn(() => ({ connected: false })),
      dispose: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isConnected: vi.fn(() => false),
      onConnected: listener(),
      onReconnected: listener(),
      onDisconnected: listener(),
      onNodeStatus: listener(),
      onNodeState: listener(),
      onReminderCount: listener(),
      onThreadCreated: listener(),
      onThreadUpdated: listener(),
      onThreadActivityChanged: listener(),
      onThreadRemindersCount: listener(),
      onMessageCreated: listener(),
      onRunEvent: listener(),
      onRunStatusChanged: listener(),
      onToolOutputChunk: listener(),
      onToolOutputTerminal: listener(),
      setRunCursor: vi.fn(),
      getRunCursor: vi.fn(() => null),
    },
  };
});

vi.mock('@/api/modules/graph', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const baseGraph = (actual.graph || {}) as Record<string, unknown>;
const emptyGraph = {
    name: 'smoke-test',
    version: 1,
    nodes: [],
    edges: [],
  };

  return {
    ...actual,
    graph: {
      ...baseGraph,
      getTemplates: vi.fn(async () => [
        {
          name: 'mock-node',
          title: 'Mock node',
          kind: 'tool',
          sourcePorts: [],
          targetPorts: [],
          capabilities: { pausable: false, staticConfigurable: true },
          staticConfigSchema: { type: 'object', properties: {} },
        },
      ]),
      getFullGraph: vi.fn(async () => emptyGraph),
      listNodeRuns: vi.fn(async () => ({ items: [] })),
      terminateRun: vi.fn(async () => ({ ok: true })),
      terminateThread: vi.fn(async () => ({ status: 'terminated' })),
      getNodeReminders: vi.fn(async () => ({ items: [] })),
      listVaultMounts: vi.fn(async () => ({ items: [] })),
      listVaultPaths: vi.fn(async () => ({ items: [] })),
      listVaultKeys: vi.fn(async () => ({ items: [] })),
      readVaultKey: vi.fn(async () => ({ value: '' })),
      writeVaultKey: vi.fn(async (mount: string, body: { path: string; key: string }) => ({
        mount,
        path: body.path,
        key: body.key,
        version: 1,
      })),
      getNodeStatus: vi.fn(async (nodeId: string) => ({
        nodeId,
        isPaused: false,
        provisionStatus: { state: 'not_ready' as const },
      })),
      getNodeState: vi.fn(async () => ({ state: {} })),
      putNodeState: vi.fn(async (_nodeId: string, state: Record<string, unknown>) => ({ state })),
      getDynamicConfigSchema: vi.fn(async () => null),
      postNodeAction: vi.fn(async () => undefined),
      saveFullGraph: vi.fn(async () => ({ version: 1, updatedAt: new Date().toISOString() })),
    },
  };
});

import App from '../App';
import { TooltipProvider } from '@agyn/ui';
import { UserProvider } from '../user/UserProvider';
import { clearRegistry } from '../components/configViews/registry';
import { initConfigViewsRegistry } from '../configViews.init';

const routerWarningSubstrings = [
  'React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7',
  'React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7',
];

function isAllowedWarningCall(args: unknown[]): boolean {
  if (!Array.isArray(args) || typeof args[0] !== 'string') return false;
  return routerWarningSubstrings.some((pattern) => args[0].includes(pattern));
}

describe('App smoke test', () => {
  let queryClient: QueryClient;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let canvasContextSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    clearRegistry();
    initConfigViewsRegistry();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('alert', vi.fn());
    canvasContextSpy = vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      fillRect: noop,
      clearRect: noop,
      getImageData: () => ({ data: [] }),
      putImageData: noop,
      createImageData: () => ({}) as ImageData,
      setTransform: noop,
      drawImage: noop,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      clip: noop,
      stroke: noop,
      strokeRect: noop,
      strokeText: noop,
      scale: noop,
      rotate: noop,
      translate: noop,
      transform: noop,
      setLineDash: noop,
      getLineDash: () => [],
      measureText: () => ({ width: 0 }),
      fillText: noop,
      rect: noop,
      arc: noop,
      quadraticCurveTo: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createPattern: () => null,
      createRadialGradient: () => ({ addColorStop: noop }),
      fill: noop,
      drawFocusIfNeeded: noop,
      globalCompositeOperation: 'source-over',
      canvas: document.createElement('canvas'),
    }) as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    queryClient.clear();
    cleanup();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    canvasContextSpy?.mockRestore();
    canvasContextSpy = null;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders primary routes without runtime errors', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={0}>
          <MemoryRouter initialEntries={['/']}>
            <UserProvider>
              <App />
            </UserProvider>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('builder-toolbar')).toBeInTheDocument());

    expect(screen.getByText('Threads')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();

    expect(errorSpy).not.toHaveBeenCalled();
    const unexpectedWarnings = warnSpy.mock.calls.filter((args) => !isAllowedWarningCall(args));
    expect(unexpectedWarnings, 'unexpected console warnings logged').toHaveLength(0);
  });
});
