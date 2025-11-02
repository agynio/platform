/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateNode } from '../nodeTypes/TemplateNode';
import { TemplatesProvider } from '../TemplatesProvider';
import { graphSocket } from '../../lib/graph/socket';

describe('TemplateNode reminders badge via socket', () => {
  const g: any = globalThis as any;
  const node: any = { id: 'n1', data: { template: 'remindMeTool', config: {} } };
  const templates: any[] = [{ name: 'remindMeTool', title: 'Remind Me', kind: 'tool', sourcePorts: {}, targetPorts: {} }];

  const origFetch = g.fetch;
  beforeEach(() => {
    g.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/reminders')) return new Response(JSON.stringify({ items: [] }));
      if (url.endsWith('/api/graph/templates')) return new Response(JSON.stringify(templates));
      return new Response('', { status: 204 });
    }) as any;
  });
  afterEach(() => { g.fetch = origFetch; });

  it('updates badge count on node_reminder_count event', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <TemplatesProvider templates={templates as any}>
          <TemplateNode id={node.id} data={node.data} />
        </TemplatesProvider>
      </QueryClientProvider>,
    );

    // Initially no badge (count 0)
    expect(screen.queryByTitle('Active reminders: 0')).toBeNull();

    // Simulate socket event for count=3
    const anySock: any = graphSocket as any;
    const listeners: Map<string, Set<(ev: any) => void>> = anySock.reminderListeners;
    let fired = false;
    for (const [nodeId, set] of listeners) {
      if (nodeId === 'n1') {
        for (const fn of set) { fn({ nodeId: 'n1', count: 3, updatedAt: new Date().toISOString() }); fired = true; }
      }
    }
    // If no listener registered yet, register and emit directly
    if (!fired) {
      const off = graphSocket.onReminderCount('n1', (ev) => {
        // noop: handled by hook via queryClient
      });
      // emit after registering
      const sets = (graphSocket as any).reminderListeners.get('n1') as Set<(ev: any) => void>;
      for (const fn of sets) fn({ nodeId: 'n1', count: 3, updatedAt: new Date().toISOString() });
      off();
    }

    // Badge should appear with count 3
    expect(await screen.findByTitle('Active reminders: 3')).toBeInTheDocument();
  });
});
