import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => navigateMock,
  };
});

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads conversation view', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    navigateMock.mockReset();
  });
  afterAll(() => server.close());

  function setupThreadData() {
    const thread = {
      id: 'th1',
      alias: 'th-a',
      summary: 'Thread A',
      status: 'open',
      createdAt: t(0),
      parentId: null,
      metrics: { remindersCount: 1, containersCount: 1, activity: 'working', runsCount: 1 },
    };

    const runMeta = { id: 'run1', threadId: 'th1', status: 'finished', createdAt: t(1), updatedAt: t(2) };

    const reminders = [{ id: 'rem1', threadId: 'th1', note: 'Follow up', at: t(50) }];
    const containers = [
      {
        containerId: 'cont-1',
        threadId: 'th1',
        image: 'ai:latest',
        name: 'cont-1-name',
        status: 'running',
        startedAt: t(0),
        lastUsedAt: t(1),
        killAfterAt: null,
        role: 'workspace',
      },
    ];

    const runsHandler = () => HttpResponse.json({ items: [runMeta] });
    const threadsHandler = () => HttpResponse.json({ items: [thread] });
    const treeHandler = () =>
      HttpResponse.json({
        items: [
          {
            ...thread,
            children: [],
            hasChildren: false,
          },
        ],
      });
    const threadHandler = () => HttpResponse.json(thread);

    const messagesHandler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      if (type === 'input') {
        return HttpResponse.json({ items: [{ id: 'm1', kind: 'user', text: 'Hi there', createdAt: t(10) }] });
      }
      if (type === 'injected') {
        return HttpResponse.json({ items: [{ id: 'm2', kind: 'system', text: 'Injected context', createdAt: t(15) }] });
      }
      if (type === 'output') {
        return HttpResponse.json({ items: [{ id: 'm3', kind: 'assistant', text: 'Hello from agent', createdAt: t(20) }] });
      }
      return HttpResponse.json({ items: [] });
    };

    server.use(
      http.get('/api/agents/threads', threadsHandler),
      http.get(abs('/api/agents/threads'), threadsHandler),
      http.get('/api/agents/threads/tree', treeHandler),
      http.get(abs('/api/agents/threads/tree'), treeHandler),
      http.get('/api/agents/threads/th1', threadHandler),
      http.get(abs('/api/agents/threads/th1'), threadHandler),
      http.get('/api/agents/threads/th1/children', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/children'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/th1/runs', runsHandler),
      http.get(abs('/api/agents/threads/th1/runs'), runsHandler),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: reminders })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: reminders })),
      http.get('/api/containers', () => HttpResponse.json({ items: containers })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: containers })),
      http.get('/api/agents/threads/th1/queued-messages', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/queued-messages'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/runs/run1/messages', messagesHandler),
      http.get(abs('/api/agents/runs/run1/messages'), messagesHandler),
    );
    return thread;
  }

  it('renders conversation messages and run info, and navigates to run timeline', async () => {
    setupThreadData();

    const user = userEvent.setup();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const threadRow = await screen.findByText('Thread A');
    await user.click(threadRow);

    const conversation = await screen.findByTestId('conversation');
    const messages = await within(conversation).findAllByTestId('conversation-message');
    expect(messages).toHaveLength(3);
    expect(messages[0]).toHaveTextContent('Hi there');
    expect(messages[0]).toHaveAttribute('data-role', 'user');
    expect(messages[1]).toHaveAttribute('data-role', 'system');
    expect(messages[2]).toHaveAttribute('data-role', 'assistant');

    const runInfo = await within(conversation).findByTestId('run-info');
    expect(runInfo).toHaveTextContent('Finished');
    const viewRunButton = within(runInfo).getByRole('button', { name: /View Run/i });
    await user.click(viewRunButton);
    expect(navigateMock).toHaveBeenCalledWith('/agents/threads/th1/runs/run1/timeline');
  });

  it('loads subthreads when expanding a thread', async () => {
    const thread = setupThreadData();

    const childThread = {
      id: 'th-child',
      alias: 'th-child',
      summary: 'Child thread',
      status: 'open',
      parentId: 'th1',
      createdAt: t(3),
      metrics: { remindersCount: 0, containersCount: 0, activity: 'waiting', runsCount: 0 },
      agentTitle: 'Agent Junior',
    };

    const childrenHandler = vi.fn(() => HttpResponse.json({ items: [childThread] }));

    const threadWithChildren = { ...thread, hasChildren: true };
    const treeWithChildren = () =>
      HttpResponse.json({
        items: [
          {
            ...threadWithChildren,
            children: [],
          },
        ],
      });

    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [threadWithChildren] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [threadWithChildren] })),
      http.get('/api/agents/threads/tree', treeWithChildren),
      http.get(abs('/api/agents/threads/tree'), treeWithChildren),
      http.get('/api/agents/threads/th1/children', () => childrenHandler()),
      http.get(abs('/api/agents/threads/th1/children'), () => childrenHandler()),
    );

    const user = userEvent.setup();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const expandButton = await screen.findByRole('button', { name: /Show subthreads/i });
    expect(expandButton).toBeInTheDocument();

    await user.click(expandButton);

    const childRow = await screen.findByText('Child thread');
    expect(childRow).toBeInTheDocument();
    expect(childrenHandler).toHaveBeenCalled();
  });
});
