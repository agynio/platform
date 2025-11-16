import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders } from './integration/testUtils';
import { ThreadTree } from '../src/components/agents/ThreadTree';
import * as socketModule from '../src/lib/graph/socket';

describe('ThreadTree conditional insertion on thread_created', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('does not insert closed thread in open filter view', async () => {
    server.use(
      http.get('/api/agents/threads', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('rootsOnly') !== 'true') return new HttpResponse(null, { status: 400 });
        if ((url.searchParams.get('status') || '') !== 'open') return new HttpResponse(null, { status: 400 });
        return HttpResponse.json({ items: [] });
      }),
    );
    render(<TestProviders><ThreadTree status="open" onSelect={() => {}} /></TestProviders>);
    // No threads initially
    expect(await screen.findByText('No threads')).toBeInTheDocument();
    // Emit thread_created with closed status
    const anySock: any = socketModule.graphSocket as any;
    const createdListeners = anySock.threadCreatedListeners as Set<(p: any) => void>;
    for (const fn of createdListeners) fn({ thread: { id: 't1', alias: 'a1', summary: null, status: 'closed', parentId: null, createdAt: new Date().toISOString() } });
    // Should still show 'No threads'
    expect(await screen.findByText('No threads')).toBeInTheDocument();
  });

  it('prepends new root thread when it matches the current filter', async () => {
    server.use(
      http.get('/api/agents/threads', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('rootsOnly') !== 'true') return new HttpResponse(null, { status: 400 });
        if ((url.searchParams.get('status') || '') !== 'open') return new HttpResponse(null, { status: 400 });
        return HttpResponse.json({ items: [] });
      }),
    );
    render(<TestProviders><ThreadTree status="open" onSelect={() => {}} /></TestProviders>);
    expect(await screen.findByText('No threads')).toBeInTheDocument();

    const anySock: any = socketModule.graphSocket as any;
    const createdListeners = anySock.threadCreatedListeners as Set<(p: any) => void>;
    for (const fn of createdListeners)
      fn({
        thread: {
          id: 't2',
          alias: 'a2',
          summary: 'Fresh root thread',
          status: 'open',
          parentId: null,
          createdAt: new Date().toISOString(),
        },
      });

    await waitFor(() => expect(screen.getByText('Fresh root thread')).toBeInTheDocument());
  });
});
