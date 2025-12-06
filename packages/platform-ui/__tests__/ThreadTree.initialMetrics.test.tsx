import React from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ThreadTree } from '../src/components/agents/ThreadTree';
import { server, TestProviders, abs } from './integration/testUtils';

describe('ThreadTree initial metrics rendering', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders activity dot color from initial metrics without socket events', async () => {
    const handler: Parameters<typeof http.get>[1] = ({ request }) => {
      const url = new URL(request.url);
      const includeMetrics = url.searchParams.get('includeMetrics');
      const rootsOnly = url.searchParams.get('rootsOnly');
      const status = url.searchParams.get('status');
      const includeAgentTitles = url.searchParams.get('includeAgentTitles');

      if (!(rootsOnly === 'true' || rootsOnly === '1')) return new HttpResponse(null, { status: 400 });
      if (status !== 'open') return new HttpResponse(null, { status: 400 });
      if (!(includeMetrics === 'true' || includeMetrics === '1')) return new HttpResponse(null, { status: 400 });
      if (!(includeAgentTitles === 'true' || includeAgentTitles === '1')) return new HttpResponse(null, { status: 400 });

      return HttpResponse.json({
        items: [
          {
            id: 'th1',
            alias: 'agent-1',
            summary: 'Root Working',
            status: 'open',
            parentId: null,
            createdAt: new Date().toISOString(),
            metrics: { remindersCount: 1, activity: 'working' as const, runsCount: 3 },
            agentName: 'Primary Agent',
          },
        ],
      });
    };

    server.use(
      http.get('/api/agents/threads', handler),
      http.get(abs('/api/agents/threads'), handler),
    );

    render(
      <TestProviders>
        <ThreadTree status="open" onSelect={() => {}} />
      </TestProviders>,
    );

    const summaryEl = await screen.findByText('Root Working');
    expect(summaryEl).toHaveClass('thread-summary');
    expect(summaryEl).toHaveClass('overflow-hidden');
    const dot = screen.getByLabelText('Activity: working');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('bg-blue-500');
    expect(screen.queryByLabelText('Activity: idle')).toBeNull();
    expect(screen.getByText('Primary Agent')).toBeInTheDocument();
    expect(screen.queryByText(/Runs/)).toBeNull();
  });
});
