import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';

const navigateMock = vi.fn();

vi.mock('../src/components/VirtualizedList', async () =>
  await import('../src/components/__tests__/__mocks__/virtualizedListMock'),
);

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
  let user: ReturnType<typeof userEvent.setup>;

  beforeAll(() => server.listen());
  beforeEach(() => {
    user = userEvent.setup();
  });
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
      http.get('/api/agents/runs/run1/messages', messagesHandler),
      http.get(abs('/api/agents/runs/run1/messages'), messagesHandler),
    );
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
    setupThreadData();

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

    server.use(
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

  function setupTwoThreadData() {
    const threadA = {
      id: 'th1',
      alias: 'th-a',
      summary: 'Thread A',
      status: 'open',
      createdAt: t(0),
      parentId: null,
      metrics: { remindersCount: 0, containersCount: 0, activity: 'working', runsCount: 1 },
    };

    const threadB = {
      id: 'th2',
      alias: 'th-b',
      summary: 'Thread B',
      status: 'open',
      createdAt: t(5),
      parentId: null,
      metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 1 },
    };

    const runA = { id: 'run1', threadId: 'th1', status: 'finished', createdAt: t(1), updatedAt: t(2) };
    const runB = { id: 'run2', threadId: 'th2', status: 'finished', createdAt: t(6), updatedAt: t(7) };

    const threadsHandler = () => HttpResponse.json({ items: [threadA, threadB] });

    server.use(
      http.get('/api/agents/threads', threadsHandler),
      http.get(abs('/api/agents/threads'), threadsHandler),
      http.get('/api/agents/threads/th1', () => HttpResponse.json(threadA)),
      http.get(abs('/api/agents/threads/th1'), () => HttpResponse.json(threadA)),
      http.get('/api/agents/threads/th2', () => HttpResponse.json(threadB)),
      http.get(abs('/api/agents/threads/th2'), () => HttpResponse.json(threadB)),
      http.get('/api/agents/threads/th1/children', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/children'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/th2/children', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th2/children'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/th1/runs', () => HttpResponse.json({ items: [runA] })),
      http.get(abs('/api/agents/threads/th1/runs'), () => HttpResponse.json({ items: [runA] })),
      http.get('/api/agents/threads/th2/runs', () => HttpResponse.json({ items: [runB] })),
      http.get(abs('/api/agents/threads/th2/runs'), () => HttpResponse.json({ items: [runB] })),
      http.get('/api/agents/runs/run1/messages', () =>
        HttpResponse.json({ items: [{ id: 'a-1', kind: 'assistant', text: 'Thread A says hello', createdAt: t(3) }] }),
      ),
      http.get(abs('/api/agents/runs/run1/messages'), () =>
        HttpResponse.json({ items: [{ id: 'a-1', kind: 'assistant', text: 'Thread A says hello', createdAt: t(3) }] }),
      ),
      http.get('/api/agents/runs/run2/messages', () =>
        HttpResponse.json({ items: [{ id: 'b-1', kind: 'assistant', text: 'Thread B checking in', createdAt: t(8) }] }),
      ),
      http.get(abs('/api/agents/runs/run2/messages'), () =>
        HttpResponse.json({ items: [{ id: 'b-1', kind: 'assistant', text: 'Thread B checking in', createdAt: t(8) }] }),
      ),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );
  }

  it('reuses cached conversation content when returning to a thread', async () => {
    setupTwoThreadData();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const threadARow = await screen.findByText('Thread A');
    await user.click(threadARow);

    const conversation = await screen.findByTestId('conversation');
    const threadAInitialMessages = await within(conversation).findAllByText('Thread A says hello');
    expect(threadAInitialMessages.length).toBeGreaterThan(0);

    const threadBRow = await screen.findByText('Thread B');
    await user.click(threadBRow);
    const conversationB = await screen.findByTestId('conversation');
    const threadBMessages = await within(conversationB).findAllByText('Thread B checking in');
    expect(threadBMessages.length).toBeGreaterThan(0);

    await user.click(threadARow);
    const conversationAfterReturn = await screen.findByTestId('conversation');
    expect(within(conversationAfterReturn).getAllByText('Thread A says hello').length).toBeGreaterThan(0);
  });
});
