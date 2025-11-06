import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/api/modules/graph', () => ({
  graph: {
    getTemplates: vi.fn(async () => ([
      { name: 'a', title: 'A', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { pausable: true } },
      { name: 'b', title: 'B', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { dynamicConfigurable: true } },
    ])),
  },
}));
import { TemplatesProvider, useTemplatesCache } from '../../graph/templates.provider';

describe('Templates cache provider', () => {
  beforeEach(() => {});

  it('loads templates and resolves by name', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={qc}>
        <TemplatesProvider>{children}</TemplatesProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useTemplatesCache(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.templates.length).toBe(2);
    expect(result.current.getTemplate('a')?.title).toBe('A');
  });
});
