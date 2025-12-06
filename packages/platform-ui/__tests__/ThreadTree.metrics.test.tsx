import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders, abs } from './integration/testUtils';
import { ThreadTree } from '../src/components/agents/ThreadTree';
import * as socketModule from '../src/lib/graph/socket';

describe('ThreadTree metrics badges and socket updates', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  it('renders activity dot and hidden-zero reminders; updates on socket', async () => {
    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      // Robustly match search params regardless of ordering or presence of optional params
      const rootsOnly = url.searchParams.get('rootsOnly');
      const status = url.searchParams.get('status') || '';
      const includeMetrics = url.searchParams.get('includeMetrics');
      const includeAgentTitles = url.searchParams.get('includeAgentTitles');
      // Accept rootsOnly=true or 1
      if (!(rootsOnly === 'true' || rootsOnly === '1')) return new HttpResponse(null, { status: 400 });
      if (status !== 'open') return new HttpResponse(null, { status: 400 });
      // includeMetrics=true may be sent by the client; accept whether present or not
      if (includeMetrics && includeMetrics !== 'true') return new HttpResponse(null, { status: 400 });
      if (includeAgentTitles && includeAgentTitles !== 'true') return new HttpResponse(null, { status: 400 });
      return HttpResponse.json({ items: [
        {
          id: 'th1',
          alias: 'a1',
          summary: 'Root A',
          status: 'open',
          parentId: null,
          createdAt: new Date().toISOString(),
          metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 4 },
          agentName: 'Agent 1',
        },
      ] });
    };
    // Register both relative and absolute handlers to match axios baseURL usage
    server.use(
      http.get('/api/agents/threads', handler as any),
      http.get(abs('/api/agents/threads'), handler as any),
    );
    render(<TestProviders><ThreadTree status="open" onSelect={() => {}} /></TestProviders>);
    const summaryEl = await screen.findByText('Root A');
    expect(summaryEl).toHaveAttribute('title', 'Root A');
    expect(summaryEl).toHaveClass('thread-summary');
    expect(summaryEl).toHaveClass('overflow-hidden');
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    // Activity indicator exists and has no visible text
    const dotIdle = screen.getByLabelText('Activity: idle');
    expect(dotIdle).toBeInTheDocument();
    expect(dotIdle.textContent).toBe('');
    // No badges rendered in the list
    expect(screen.queryByText(/Runs/)).toBeNull();
    expect(screen.queryByLabelText(/Active reminders:/)).toBeNull();

    // Simulate socket activity change + reminders count
    const anySock: any = socketModule.graphSocket as any;
    const actListeners = anySock.threadActivityListeners as Set<(p: any) => void>;
    const remListeners = anySock.threadRemindersListeners as Set<(p: any) => void>;
    for (const fn of actListeners) fn({ threadId: 'th1', activity: 'working' });
    for (const fn of remListeners) fn({ threadId: 'th1', remindersCount: 2 });

    const dotWorking = await screen.findByLabelText('Activity: working');
    expect(dotWorking).toBeInTheDocument();
    expect(dotWorking.textContent).toBe('');
    // Still no badges after realtime updates
    expect(screen.queryByText(/Runs/)).toBeNull();
    expect(screen.queryByLabelText(/Active reminders:/)).toBeNull();
  });
});
