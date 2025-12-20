import React, { type ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { TemplateSchema } from '@/api/types/graph';
import type { GraphPersisted } from '../../types';

import { useNodeTitleMap } from '../useNodeTitleMap';

const serviceMocks = vi.hoisted(() => ({
  fetchGraph: vi.fn(),
  fetchTemplates: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  graphApiService: serviceMocks,
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
    serviceMocks.fetchTemplates.mockReset();
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

    serviceMocks.fetchGraph.mockResolvedValue(graphResponse);
    serviceMocks.fetchTemplates.mockResolvedValue(templatesResponse);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNodeTitleMap(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(serviceMocks.fetchGraph).toHaveBeenCalledTimes(1);
    expect(serviceMocks.fetchTemplates).toHaveBeenCalledTimes(1);
    expect(result.current.titleMap.get('alpha-node')).toBe('Agent Alpha');
    expect(result.current.titleMap.get('beta-node')).toBe('Tool Template');
  });
});
