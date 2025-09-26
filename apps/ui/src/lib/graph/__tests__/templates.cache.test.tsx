import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesProvider, useTemplatesCache } from '../../graph/templates.provider';

const g: any = globalThis;

describe('Templates cache provider', () => {
  const origFetch = g.fetch;
  beforeEach(() => {
    g.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/graph/templates')) {
        return new Response(
          JSON.stringify([
            { name: 'a', title: 'A', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { pausable: true } },
            { name: 'b', title: 'B', kind: 'tool', sourcePorts: {}, targetPorts: {}, capabilities: { dynamicConfigurable: true } },
          ]),
        );
      }
      return new Response('', { status: 204 });
    }) as any;
  });
  afterEach(() => {
    g.fetch = origFetch;
  });

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
