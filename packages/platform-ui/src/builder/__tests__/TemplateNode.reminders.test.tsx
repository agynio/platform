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
  const templates: any[] = [{ name: 'remindMeTool', title: 'Remind Me', kind: 'tool', sourcePorts: [], targetPorts: [] }];

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

    // Wait until hook registers socket listener, then emit
    const anySock: any = graphSocket as any;
    let attempts = 0;
    while (attempts < 10 && !(anySock.reminderListeners && anySock.reminderListeners.get('n1'))) {
      await new Promise((r) => setTimeout(r, 10));
      attempts += 1;
    }
    const set = (anySock.reminderListeners.get('n1') as Set<(ev: any) => void>) || new Set();
    for (const fn of set) fn({ nodeId: 'n1', count: 3, updatedAt: new Date().toISOString() });
    // Wait until query cache reflects count
    let tries = 0;
    while (tries < 20) {
      const d = qc.getQueryData(['graph', 'node', 'n1', 'reminders', 'count']) as { count?: number } | undefined;
      if (d?.count === 3) break;
      await new Promise((r) => setTimeout(r, 10));
      tries += 1;
    }

    // Badge should appear with count 3
    expect(await screen.findByTitle('Active reminders: 3')).toBeInTheDocument();
  });
});
