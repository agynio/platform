import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import McpServerDynamicConfigView from '@/components/configViews/McpServerDynamicConfigView';

const g: any = globalThis;

vi.mock('@/lib/graph/hooks', () => {
  return {
    useMcpNodeState: (nodeId: string) => {
      const [enabledTools, setEnabledToolsState] = React.useState<string[] | undefined>(undefined);
      const tools = [
        { name: 't1', description: 'Tool 1' },
        { name: 't2', description: 'Tool 2' },
      ];
      return {
        tools,
        enabledTools,
        isLoading: false,
        setEnabledTools: (next: string[]) => {
          setEnabledToolsState(next);
          // simulate API call for assertion
          fetch(`/api/graph/nodes/${nodeId}/state`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: { mcp: { enabledTools: next } } }),
          });
        },
      } as const;
    },
  };
});

describe('MCP tools management via node state', () => {
  const origFetch = g.fetch;
  const nodeId = 'n1';

  beforeEach(() => {
    g.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes(`/api/graph/nodes/${nodeId}/state`) && init?.method === 'PUT') {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        expect(body).toEqual({ state: { mcp: { enabledTools: ['t1'] } } });
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response('', { status: 204 });
    }) as any;
  });
  afterEach(() => {
    g.fetch = origFetch;
  });

  it('renders tools from state and derives enabled when enabledTools undefined', () => {
    render(<McpServerDynamicConfigView nodeId={nodeId} templateName="mcpServer" value={{}} onChange={() => {}} />);
    expect(screen.getByTestId('tool-t1')).toBeInTheDocument();
    const c1 = screen.getByRole('checkbox', { name: /t1/ }) as HTMLInputElement;
    const c2 = screen.getByRole('checkbox', { name: /t2/ }) as HTMLInputElement;
    // All enabled by default when enabledTools is undefined
    expect(c1.checked).toBe(true);
    expect(c2.checked).toBe(true);
  });

  it('toggle writes enabledTools and updates UI', async () => {
    render(<McpServerDynamicConfigView nodeId={nodeId} templateName="mcpServer" value={{}} onChange={() => {}} />);
    expect(screen.getByTestId('tool-t1')).toBeInTheDocument();
    const c1 = screen.getByRole('checkbox', { name: /t1/ }) as HTMLInputElement;
    // Disable t2 -> PUT with ['t1']
    const c2 = screen.getByRole('checkbox', { name: /t2/ }) as HTMLInputElement;
    fireEvent.click(c2);
    await waitFor(() => expect(g.fetch).toHaveBeenCalled());
    await waitFor(() => expect(c2.checked).toBe(false));
    expect(c1.checked).toBe(true);
  });
});
