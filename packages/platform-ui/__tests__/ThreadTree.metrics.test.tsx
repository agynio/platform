import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from './integration/testUtils';
import { ThreadTree } from '../src/components/agents/ThreadTree';
import * as socketModule from '../src/lib/graph/socket';

describe('ThreadTree metrics badges and socket updates', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  it('renders activity dot and hidden-zero reminders; updates on socket', async () => {
    server.use(
      http.get('/api/agents/threads', ({ request }) => {
        const url = new URL(request.url);
        // Match exact query used by ThreadTree fetch
        if (url.searchParams.get('rootsOnly') !== 'true') return new HttpResponse(null, { status: 400 });
        if ((url.searchParams.get('status') || '') !== 'open') return new HttpResponse(null, { status: 400 });
        // includeMetrics=true is expected; we accept regardless
        return HttpResponse.json({ items: [
          { id: 'th1', alias: 'a1', summary: 'Root A', status: 'open', parentId: null, createdAt: new Date().toISOString(), metrics: { remindersCount: 0, activity: 'idle' } },
        ] });
      }),
    );
    render(<TestProviders><ThreadTree status="open" onSelect={() => {}} /></TestProviders>);
    await screen.findByText('Root A');
    // Activity indicator exists and has no visible text
    const dotIdle = screen.getByLabelText('Activity: idle');
    expect(dotIdle).toBeInTheDocument();
    expect(dotIdle.textContent).toBe('');
    // Reminders badge hidden when 0
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
    expect(screen.getByLabelText('Active reminders: 2')).toBeInTheDocument();
  });
});
