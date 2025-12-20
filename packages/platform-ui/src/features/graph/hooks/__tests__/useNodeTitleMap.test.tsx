import React, { type ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { TemplateSchema } from '@/api/types/graph';
import type { GraphPersisted } from '../../types';

import { useNodeTitleMap } from '../useNodeTitleMap';

const serviceMocks = vi.hoisted(() => ({
  fetchGraph: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  graphApiService: serviceMocks,
}));

const templateHookMocks = vi.hoisted(() => ({
  useTemplates: vi.fn(),
}));

vi.mock('@/lib/graph/hooks', () => ({
  useTemplates: templateHookMocks.useTemplates,
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

describe('useNodeTitleMap', () => {
  beforeEach(() => {
    serviceMocks.fetchGraph.mockReset();
    templateHookMocks.useTemplates.mockReset();
  });

  it('builds a title map from graph nodes and templates', async () => {
    const graphResponse: GraphPersisted = {
      name: 'agents',
      version: 3,
      nodes: [
        {
          id: 'alpha-node',
          template: 'tpl-agent',
          config: { title: 'Agent Alpha' },
          position: { x: 0, y: 0 },
        },
        {
          id: 'beta-node',
          template: 'tpl-tool',
          config: {},
          position: { x: 10, y: 10 },
        },
      ],
      edges: [],
    } as GraphPersisted;

    const templatesResponse: TemplateSchema[] = [
      {
        name: 'tpl-agent',
        title: 'Agent Template',
        kind: 'agent',
        sourcePorts: {},
        targetPorts: {},
      },
      {
        name: 'tpl-tool',
        title: 'Tool Template',
        kind: 'tool',
        sourcePorts: {},
        targetPorts: {},
      },
    ];
    const templatesQuery = {
      data: templatesResponse,
      status: 'success' as const,
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };

    serviceMocks.fetchGraph.mockResolvedValue(graphResponse);
    templateHookMocks.useTemplates.mockReturnValue(templatesQuery);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNodeTitleMap(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(serviceMocks.fetchGraph).toHaveBeenCalledTimes(1);
    expect(templateHookMocks.useTemplates).toHaveBeenCalled();
    expect(result.current.titleMap.get('alpha-node')).toBe('Agent Alpha');
    expect(result.current.titleMap.get('beta-node')).toBe('Tool Template');
  });
});
