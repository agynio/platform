import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { TooltipProvider } from '@agyn/ui-new';
import { UserProvider } from '../user/UserProvider';
import { clearRegistry } from '../components/configViews/registry';
import { initConfigViewsRegistry } from '../configViews.init';
import { graphSocket } from '@/lib/graph/socket';
import { graph as graphApi } from '@/api/modules/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const noop = () => {};

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
  let spyRestorers: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    clearRegistry();
    initConfigViewsRegistry();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('alert', vi.fn());
    const subscribeSpy = vi.spyOn(graphSocket, 'subscribe').mockImplementation(() => {});
    const unsubscribeSpy = vi.spyOn(graphSocket, 'unsubscribe').mockImplementation(() => {});
    const onNodeStatusSpy = vi.spyOn(graphSocket, 'onNodeStatus').mockReturnValue(noop);
    const onReconnectedSpy = vi.spyOn(graphSocket, 'onReconnected').mockReturnValue(noop);
    const onNodeStateSpy = vi.spyOn(graphSocket, 'onNodeState').mockReturnValue(noop);
    const onReminderCountSpy = vi.spyOn(graphSocket, 'onReminderCount').mockReturnValue(noop);
    const disposeSpy = vi.spyOn(graphSocket, 'dispose').mockImplementation(() => {});
    const setRunCursorSpy = vi.spyOn(graphSocket, 'setRunCursor').mockImplementation(() => {});
    const getRunCursorSpy = vi.spyOn(graphSocket, 'getRunCursor').mockReturnValue(null);
    const getTemplatesSpy = vi.spyOn(graphApi, 'getTemplates').mockResolvedValue([
      {
        name: 'mock-node',
        title: 'Mock node',
        kind: 'tool',
        sourcePorts: [],
        targetPorts: [],
        capabilities: { pausable: false, staticConfigurable: true },
        staticConfigSchema: { type: 'object', properties: {} },
      },
    ]);
    const getFullGraphSpy = vi.spyOn(graphApi, 'getFullGraph').mockResolvedValue({
      name: 'smoke-test',
      version: 1,
      nodes: [],
      edges: [],
    } as any);
    const getNodeStatusSpy = vi.spyOn(graphApi, 'getNodeStatus').mockResolvedValue({
      nodeId: 'node-1',
      isPaused: false,
      provisionStatus: { state: 'not_ready' as const },
    } as any);
    spyRestorers = [
      () => subscribeSpy.mockRestore(),
      () => unsubscribeSpy.mockRestore(),
      () => onNodeStatusSpy.mockRestore(),
      () => onReconnectedSpy.mockRestore(),
      () => onNodeStateSpy.mockRestore(),
      () => onReminderCountSpy.mockRestore(),
      () => disposeSpy.mockRestore(),
      () => setRunCursorSpy.mockRestore(),
      () => getRunCursorSpy.mockRestore(),
      () => getTemplatesSpy.mockRestore(),
      () => getFullGraphSpy.mockRestore(),
      () => getNodeStatusSpy.mockRestore(),
    ];
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
    cleanup();
    queryClient.clear();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    canvasContextSpy?.mockRestore();
    canvasContextSpy = null;
    for (const restore of spyRestorers) restore();
    spyRestorers = [];
    vi.unstubAllGlobals();
  });

  it('renders primary routes without runtime errors', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/']}>
            <UserProvider>
              <App />
            </UserProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText('Graph Canvas')).toBeInTheDocument());

    expect(errorSpy).not.toHaveBeenCalled();
    const unexpectedWarnings = warnSpy.mock.calls.filter((args) => !isAllowedWarningCall(args));
    expect(unexpectedWarnings, 'unexpected console warnings logged').toHaveLength(0);
  });
});
