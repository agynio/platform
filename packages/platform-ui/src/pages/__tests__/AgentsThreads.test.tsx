import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../AgentsThreads';
import { TestProviders, server, abs } from '../../../__tests__/integration/testUtils';
import type { PersistedGraph } from '@agyn/shared';
import type { TemplateSchema } from '@/api/types/graph';
import type { MarkdownComposerProps } from '../../components/MarkdownComposer';

const notifyMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifyMocks.success(...args),
  notifyError: (...args: unknown[]) => notifyMocks.error(...args),
}));

vi.mock('../../components/MarkdownComposer', () => {
  const MockMarkdownComposer = ({
    value,
    onChange,
    placeholder,
    sendDisabled,
    onSend,
    isSending,
    textareaProps,
  }: MarkdownComposerProps) => (
    <div>
      <textarea
        data-testid="markdown-composer-editor"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const target = event.target as HTMLTextAreaElement;
          const maxLength = typeof textareaProps?.maxLength === 'number' ? textareaProps.maxLength : null;
          const nextValue = target.value;
          if (maxLength !== null && nextValue.length > maxLength) {
            target.value = value;
            return;
          }
          onChange(nextValue);
        }}
        aria-label={placeholder}
        maxLength={textareaProps?.maxLength}
      />
      {onSend ? (
        <button
          type="button"
          title="Send message"
          aria-label="Send message"
          onClick={onSend}
          disabled={Boolean(sendDisabled) || Boolean(isSending)}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      ) : null}
    </div>
  );

  return { MarkdownComposer: MockMarkdownComposer };
});

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

type ThreadMock = {
  id: string;
  alias: string;
  summary: string;
  status: 'open' | 'closed';
  createdAt: string;
  parentId: string | null;
  metrics: { remindersCount: number; containersCount: number; activity: 'idle' | 'waiting' | 'working'; runsCount: number };
  agentTitle?: string | null;
  agentRole?: string | null;
  agentName?: string | null;
};

type RunMock = {
  id: string;
  threadId: string;
  status: 'running' | 'finished' | 'terminated';
  createdAt: string;
  updatedAt: string;
};

type ReminderMock = {
  id: string;
  threadId: string;
  note: string;
  at: string;
  createdAt: string;
  completedAt: string | null;
};


function makeThread(overrides: Partial<ThreadMock> = {}): ThreadMock {
  return {
    id: 'thread-1',
    alias: 'alias-1',
    summary: 'Thread from API',
    status: 'open',
    createdAt: t(0),
    parentId: null,
    metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
    agentTitle: 'Agent Uno',
    agentRole: 'Lead Planner',
    agentName: 'Planner Uno',
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunMock> = {}): RunMock {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    status: 'finished',
    createdAt: t(1),
    updatedAt: t(2),
    ...overrides,
  };
}

function makeReminder(overrides: Partial<ReminderMock> = {}): ReminderMock {
  return {
    id: 'reminder-1',
    threadId: 'thread-1',
    note: 'Reminder',
    at: t(3),
    createdAt: t(2),
    completedAt: null,
    ...overrides,
  };
}

function buildTreeResponse(threads: ThreadMock[], childrenByParent: Map<string, ThreadMock[]> = new Map()) {
  return {
    items: threads.map((thread) => {
      const children = childrenByParent.get(thread.id) ?? [];
      return {
        ...thread,
        children: children.map((child) => ({ ...child, children: [], hasChildren: false })),
        hasChildren: children.length > 0,
      };
    }),
  };
}

function registerThreadScenario({
  thread,
  runs,
  children = [],
  reminders = [],
}: {
  thread: ThreadMock;
  runs: RunMock[];
  children?: ThreadMock[];
  reminders?: ReminderMock[];
}) {
  const threadPayload: ThreadMock = {
    ...thread,
    metrics: { ...thread.metrics, runsCount: runs.length },
  };
  const childMap = new Map<string, ThreadMock[]>([[threadPayload.id, children]]);
  server.use(
    http.get('*/api/agents/threads', () => HttpResponse.json({ items: [threadPayload] })),
    http.get('*/api/agents/threads/tree', () => HttpResponse.json(buildTreeResponse([threadPayload], childMap))),
    http.get('*/api/agents/threads/:threadId', ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json(threadPayload);
      }
      return new HttpResponse(null, { status: 404 });
    }),
    http.get('*/api/agents/threads/:threadId/runs', ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json({ items: runs });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.get('*/api/agents/threads/:threadId/children', ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json({ items: children });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.options('*/api/agents/threads/:threadId/children', () => new HttpResponse(null, { status: 200 })),
    http.get(abs('/api/agents/threads/:threadId/children'), ({ params }) => {
      if (params.threadId === threadPayload.id) {
        return HttpResponse.json({ items: children });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.options(abs('/api/agents/threads/:threadId/children'), () => new HttpResponse(null, { status: 200 })),
    http.get(abs('/api/agents/threads/tree'), () => HttpResponse.json(buildTreeResponse([threadPayload], childMap))),
    http.get('*/api/agents/runs/:runId/messages', () => HttpResponse.json({ items: [] })),
    http.get('*/api/agents/reminders', () => HttpResponse.json({ items: reminders })),
    http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: reminders })),
    http.options('*/api/agents/reminders', () => new HttpResponse(null, { status: 200 })),
    http.options(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 200 })),
    http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
  );
}

function registerGraphAgents(agents: Array<{ id: string; template: string; title: string }>) {
  const graphPayload = {
    name: 'agents',
    version: 1,
    updatedAt: t(0),
    nodes: agents.map((agent) => ({
      id: agent.id,
      template: agent.template,
      config: { title: agent.title },
    })),
    edges: [],
  } satisfies PersistedGraph;

  const templatePayload = agents.map(
    (agent) =>
      ({
        name: agent.template,
        title: agent.title,
        kind: 'agent',
        sourcePorts: [] as string[],
        targetPorts: [] as string[],
      } satisfies TemplateSchema),
  );

  server.use(
    http.get('*/api/graph', () => HttpResponse.json(graphPayload)),
    http.get(abs('/api/graph'), () => HttpResponse.json(graphPayload)),
    http.get('*/api/graph/templates', () => HttpResponse.json(templatePayload)),
    http.get(abs('/api/graph/templates'), () => HttpResponse.json(templatePayload)),
  );
}

async function findComposerEditor() {
  const editors = await screen.findAllByTestId('markdown-composer-editor');
  return editors[0] as HTMLElement;
}

function overwriteComposer(editor: HTMLElement, text: string) {
  if (editor instanceof HTMLTextAreaElement) {
    fireEvent.change(editor, { target: { value: text } });
    return;
  }
  editor.focus();
  editor.textContent = text;
  const eventInit = {
    bubbles: true,
    data: text,
    inputType: text ? 'insertFromPaste' : 'deleteContentBackward',
  } as InputEventInit;
  fireEvent.beforeInput(editor, eventInit);
  fireEvent.input(editor, eventInit);
}

function getComposerText(editor: HTMLElement) {
  if (editor instanceof HTMLTextAreaElement) {
    return editor.value;
  }
  return editor.textContent ?? '';
}

describe('AgentsThreads page', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    vi.restoreAllMocks();
    server.resetHandlers();
    notifyMocks.success.mockReset();
    notifyMocks.error.mockReset();
  });
  afterAll(() => server.close());

  function renderAt(path: string) {
    return render(
      <TestProviders>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/agents/threads">
              <Route index element={<AgentsThreads />} />
              <Route path=":threadId" element={<AgentsThreads />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    );
  }

  async function expectDetailStatus(summary: string, label: string) {
    const detailHeading = await screen.findByRole('heading', { name: summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(detailContainer).toBeTruthy();
    expect(await within(detailContainer).findByLabelText(label)).toBeInTheDocument();
  }

  function expectListStatus(summary: string, label: string) {
    const list = screen.getByTestId('threads-list');
    const summaryNode = within(list).getByText(summary);
    const row = summaryNode.parentElement?.parentElement as HTMLElement | null;
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByLabelText(label)).toBeInTheDocument();
  }

  it('loads thread details when navigating directly to a thread id', async () => {
    const thread = makeThread();
    const run = makeRun();
    registerThreadScenario({ thread, runs: [run], children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    expect(await screen.findByRole('heading', { name: thread.summary })).toBeInTheDocument();
    expect(screen.getByTestId('threads-list')).toBeInTheDocument();
    expect(screen.queryByText('Agents / Threads')).not.toBeInTheDocument();
    const detailHeading = await screen.findByRole('heading', { name: thread.summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(within(detailContainer).getByText(thread.agentName ?? '')).toBeInTheDocument();
    if (thread.agentRole) {
      expect(within(detailContainer).getByTestId('thread-detail-role')).toHaveTextContent(thread.agentRole ?? '');
    } else {
      expect(within(detailContainer).queryByTestId('thread-detail-role')).toBeNull();
    }
    const list = screen.getByTestId('threads-list');
    expect(within(list).getByText(thread.agentName ?? '')).toBeInTheDocument();
    expect(within(list).getByTestId('thread-item-role')).toHaveTextContent(thread.agentRole ?? '');
  });

  it('hides agent role display when not provided', async () => {
    const thread = makeThread({ agentRole: null });
    registerThreadScenario({ thread, runs: [], children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    const detailHeading = await screen.findByRole('heading', { name: thread.summary });
    const detailContainer = detailHeading.parentElement as HTMLElement;
    expect(within(detailContainer).getByText(thread.agentName ?? '')).toBeInTheDocument();
    expect(within(detailContainer).queryByTestId('thread-detail-role')).toBeNull();

    const list = screen.getByTestId('threads-list');
    expect(within(list).getByText(thread.agentName ?? '')).toBeInTheDocument();
    expect(within(list).queryByTestId('thread-item-role')).toBeNull();
  });

  it('shows a friendly error when the thread is missing', async () => {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/tree', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/tree'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/thread-missing', () => new HttpResponse(null, { status: 404 })),
      http.get(abs('/api/agents/threads/thread-missing'), () => new HttpResponse(null, { status: 404 })),
      http.get('/api/agents/threads/thread-missing/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/thread-missing/runs'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/threads/thread-missing/children', () => new HttpResponse(null, { status: 404 })),
      http.get(abs('/api/agents/threads/thread-missing/children'), () => new HttpResponse(null, { status: 404 })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );

    renderAt('/agents/threads/thread-missing');

    expect(
      await screen.findByText('Thread not found. The link might be invalid or the thread was removed.'),
    ).toBeInTheDocument();
  });

  it('sends a message and clears the composer input', async () => {
    const thread = makeThread();
    registerThreadScenario({ thread, runs: [], children: [] });

    const requests: Array<{ params: Record<string, string>; body: unknown }> = [];
    const pendingResolvers: Array<() => void> = [];
    const holdResponse = () =>
      new Promise<void>((resolve) => {
        pendingResolvers.push(resolve);
      });
    server.use(
      http.post('*/api/agents/threads/:threadId/messages', async ({ params, request }) => {
        const json = await request.json();
        requests.push({ params: params as Record<string, string>, body: json });
        await holdResponse();
        return HttpResponse.json({ ok: true });
      }),
      http.post(abs('/api/agents/threads/:threadId/messages'), async ({ params, request }) => {
        const json = await request.json();
        requests.push({ params: params as Record<string, string>, body: json });
        await holdResponse();
        return HttpResponse.json({ ok: true });
      }),
    );

    const user = userEvent.setup();

    renderAt(`/agents/threads/${thread.id}`);

    const editor = await findComposerEditor();
    await user.type(editor, '  hello agent  ');

    const getSendButton = () => screen.getByRole('button', { name: 'Send message' });
    await user.click(getSendButton());

    await waitFor(() => {
      expect(getSendButton()).toBeDisabled();
    });

    await waitFor(() => {
      expect(pendingResolvers.length).toBeGreaterThan(0);
    });

    pendingResolvers.splice(0).forEach((resolve) => resolve());

    await waitFor(() => {
      expect(requests.length).toBeGreaterThan(0);
    });
    const first = requests[0];
    expect(first.params.threadId).toBe(thread.id);
    expect(first.body).toEqual({ text: 'hello agent' });

    await waitFor(() => {
      expect(getComposerText(editor)).toBe('');
      expect(getSendButton()).not.toBeDisabled();
    });
  });

  it('shows Running when any run is active', async () => {
    const thread = makeThread();
    const runs = [
      makeRun({ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(3) }),
      makeRun({ id: 'run-running', status: 'running', createdAt: t(4), updatedAt: t(5) }),
    ];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Running');
    expectListStatus(thread.summary, 'Running');
  });

  it('shows Finished when the latest run terminated', async () => {
    const thread = makeThread();
    const runs = [
      makeRun({ id: 'run-old', status: 'finished', createdAt: t(1), updatedAt: t(2) }),
      makeRun({ id: 'run-terminated', status: 'terminated', createdAt: t(6), updatedAt: t(7) }),
    ];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Finished');
    expectListStatus(thread.summary, 'Finished');
  });

  it('shows Finished when the thread is closed and no runs are active', async () => {
    const thread = makeThread({ status: 'closed' });
    const runs = [makeRun({ id: 'run-finished', status: 'finished', createdAt: t(2), updatedAt: t(3) })];
    registerThreadScenario({ thread, runs, children: [] });

    const user = userEvent.setup();

    renderAt(`/agents/threads/${thread.id}`);

    await expectDetailStatus(thread.summary, 'Finished');
    const allButton = await screen.findByRole('button', { name: 'All' });
    await user.click(allButton);
    await screen.findByTestId('threads-list');
    expectListStatus(thread.summary, 'Finished');
  });

  it('shows Finished when the thread is open without active runs, reminders, or running subthreads', async () => {
    const thread = makeThread({ status: 'open' });
    const runs = [makeRun({ id: 'run-finished', status: 'finished', createdAt: t(2), updatedAt: t(3) })];
    registerThreadScenario({ thread, runs, children: [] });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Finished');
    expectListStatus(thread.summary, 'Finished');
  });

  it('shows Pending when the thread has active reminders', async () => {
    const thread = makeThread({ id: '11111111-1111-1111-1111-111111111111', status: 'open' });
    const reminders = [makeReminder({ id: 'rem-1', threadId: thread.id })];
    registerThreadScenario({ thread, runs: [], children: [], reminders });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Pending');
    expectListStatus(thread.summary, 'Pending');
  });

  it('shows Pending when a subthread is running', async () => {
    const thread = makeThread({ summary: 'Parent thread' });
    const childThread = makeThread({
      id: 'child-1',
      parentId: thread.id,
      summary: 'Child thread',
      metrics: { remindersCount: 0, containersCount: 0, activity: 'working', runsCount: 0 },
    });
    registerThreadScenario({
      thread,
      runs: [makeRun({ status: 'finished' })],
      children: [childThread],
    });

    renderAt(`/agents/threads/${thread.id}`);

    await screen.findByTestId('threads-list');
    await expectDetailStatus(thread.summary, 'Pending');
    expectListStatus(thread.summary, 'Pending');
  });

  it('preloads subthreads when viewing the list without a selected thread', async () => {
    const thread = makeThread({ summary: 'Thread root' });
    const child = makeThread({ id: 'child-1', summary: 'Root child', parentId: thread.id, createdAt: t(10) });
    registerThreadScenario({ thread, runs: [], children: [child] });

    const user = userEvent.setup();

    renderAt('/agents/threads');

    const expandButton = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(expandButton);

    expect(screen.queryByText('Loading subthreads…')).not.toBeInTheDocument();
    expect(await screen.findByText('Root child')).toBeInTheDocument();
  });

  it('preloads immediate subthreads for the selected thread', async () => {
    const thread = makeThread({ summary: 'Thread with children' });
    const runs = [makeRun({ id: 'run-with-children' })];
    const childOne = makeThread({ id: 'child-1', summary: 'First subthread', parentId: thread.id, createdAt: t(10) });
    const childTwo = makeThread({ id: 'child-2', summary: 'Second subthread', parentId: thread.id, createdAt: t(11) });
    registerThreadScenario({ thread, runs, children: [childOne, childTwo] });

    const user = userEvent.setup();

    renderAt(`/agents/threads/${thread.id}`);

    expect(await screen.findByRole('heading', { name: thread.summary })).toBeInTheDocument();

    const expandButton = await screen.findByRole('button', { name: /Show 2 subthreads/i });
    await user.click(expandButton);

    expect(screen.queryByText('Loading subthreads…')).not.toBeInTheDocument();
    expect(await screen.findByText('First subthread')).toBeInTheDocument();
    expect(screen.getByText('Second subthread')).toBeInTheDocument();
  });

  it('surfaces subthread preload failures without retrying endlessly', async () => {
    const thread = makeThread({ summary: 'Thread with failing children' });
    const runs = [makeRun({ id: 'run-with-failure' })];
    let callCount = 0;

    registerThreadScenario({ thread, runs, children: [] });

    server.use(
      http.get('*/api/agents/threads/tree', () =>
        HttpResponse.json({
          items: [
            {
              ...thread,
              metrics: { ...thread.metrics, runsCount: runs.length },
              hasChildren: true,
              children: [],
            },
          ],
        }),
      ),
      http.get(abs('/api/agents/threads/tree'), () =>
        HttpResponse.json({
          items: [
            {
              ...thread,
              metrics: { ...thread.metrics, runsCount: runs.length },
              hasChildren: true,
              children: [],
            },
          ],
        }),
      ),
      http.get('*/api/agents/threads/:threadId/children', ({ params }) => {
        if (params.threadId === thread.id) {
          callCount += 1;
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.options('*/api/agents/threads/:threadId/children', () => new HttpResponse(null, { status: 200 })),
      http.get(abs('/api/agents/threads/:threadId/children'), ({ params }) => {
        if (params.threadId === thread.id) {
          callCount += 1;
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.options(abs('/api/agents/threads/:threadId/children'), () => new HttpResponse(null, { status: 200 })),
    );

    renderAt(`/agents/threads/${thread.id}`);

    expect(await screen.findByRole('heading', { name: thread.summary })).toBeInTheDocument();

    await waitFor(() => expect(callCount).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(callCount).toBeLessThanOrEqual(2);

    expect(await screen.findByText(/Failed to load subthreads/i)).toBeInTheDocument();
  });

  describe('draft thread creation flow', () => {
    beforeEach(() => {
      Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: vi.fn(),
      });
    });

    it('creates and selects a draft thread when clicking New', async () => {
      const user = userEvent.setup();
      const thread = makeThread();
      registerThreadScenario({ thread, runs: [] });
      registerGraphAgents([]);

      renderAt('/agents/threads');

      const newButton = await screen.findByRole('button', { name: 'New thread' });
      await user.click(newButton);

      const list = await screen.findByTestId('threads-list');
      expect(within(list).getByText('(new conversation)')).toBeInTheDocument();

      const searchInput = await screen.findByPlaceholderText('Search agents...');
      expect(searchInput).toBeInTheDocument();

      expect(screen.getByText(/Start your new conversation with the agent/i)).toBeInTheDocument();
    });

    it('allows selecting a recipient and cancel removes the draft', async () => {
      const user = userEvent.setup();
      const thread = makeThread();
      registerThreadScenario({ thread, runs: [] });
      registerGraphAgents([
        { id: 'agent-1', template: 'agent.template.one', title: 'Agent Nimbus' },
        { id: 'agent-2', template: 'agent.template.two', title: 'Agent Cirrus' },
      ]);

      renderAt('/agents/threads');

      await user.click(await screen.findByRole('button', { name: 'New thread' }));

      const searchInput = await screen.findByPlaceholderText('Search agents...');
      const option = await screen.findByRole('button', { name: 'Agent Nimbus' });
      await user.click(option);

      await waitFor(() => {
        expect(searchInput).toHaveValue('Agent Nimbus');
      });

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(within(screen.getByTestId('threads-list')).queryByText('(new conversation)')).not.toBeInTheDocument();
      });
      expect(screen.getByText(/Select a thread to view details/i)).toBeInTheDocument();
    });

    it('filters recipients by visible name when searching', async () => {
      const user = userEvent.setup();
      const thread = makeThread();
      registerThreadScenario({ thread, runs: [] });
      registerGraphAgents([
        { id: 'agent-1', template: 'agent.template.one', title: 'Agent Nimbus' },
        { id: 'agent-2', template: 'agent.template.two', title: 'Agent Cirrus' },
      ]);

      renderAt('/agents/threads');

      await user.click(await screen.findByRole('button', { name: 'New thread' }));

      const searchInput = await screen.findByPlaceholderText('Search agents...');
      await screen.findByRole('button', { name: 'Agent Nimbus' });

      await user.type(searchInput, 'Cirrus');

      const visibleOption = await screen.findByRole('button', { name: 'Agent Cirrus' });
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Agent Nimbus' })).not.toBeInTheDocument();
      });

      await user.click(visibleOption);

      await waitFor(() => {
        expect(searchInput).toHaveValue('Agent Cirrus');
      });
    });
    it('shows draft composer and enforces send button state', async () => {
      const user = userEvent.setup();
      const thread = makeThread();
      registerThreadScenario({ thread, runs: [] });
      registerGraphAgents([{ id: 'agent-1', template: 'agent.template.one', title: 'Agent Nimbus' }]);

      renderAt('/agents/threads');

      await user.click(await screen.findByRole('button', { name: 'New thread' }));

      expect(screen.getByText(/Start your new conversation with the agent/i)).toBeInTheDocument();

      const searchInput = await screen.findByPlaceholderText('Search agents...');
      const editor = await findComposerEditor();
      const sendButton = screen.getByTitle('Send message');

      expect(sendButton).toBeDisabled();

      await user.click(searchInput);
      const option = await screen.findByRole('button', { name: 'Agent Nimbus' });
      await user.click(option);

      await waitFor(() => {
        expect(searchInput).toHaveValue('Agent Nimbus');
      });

      expect(sendButton).toBeDisabled();

      await user.type(editor, 'Hello draft');
      await waitFor(() => {
        expect(sendButton).toBeEnabled();
      });

      overwriteComposer(editor, '');
      overwriteComposer(editor, 'a'.repeat(8001));
      await waitFor(() => {
        expect(getComposerText(editor).length).toBeLessThanOrEqual(8000);
      });
      await waitFor(() => {
        expect(sendButton).toBeDisabled();
      });

      overwriteComposer(editor, 'Ready to send');
      await waitFor(() => {
        expect(sendButton).toBeEnabled();
      });
    });

    it('does not fetch thread or run data when a draft is selected', async () => {
      const user = userEvent.setup();
      const thread = makeThread();
      registerThreadScenario({ thread, runs: [] });
      registerGraphAgents([]);

      const draftThreadRequests: string[] = [];
      const draftRunsRequests: string[] = [];

      server.use(
        http.get('*/api/agents/threads/:threadId', ({ params }) => {
          const id = params.threadId as string;
          if (id.startsWith('draft:')) {
            draftThreadRequests.push(id);
            return HttpResponse.json({});
          }
          return undefined;
        }),
        http.get(abs('/api/agents/threads/:threadId'), ({ params }) => {
          const id = params.threadId as string;
          if (id.startsWith('draft:')) {
            draftThreadRequests.push(id);
            return HttpResponse.json({});
          }
          return undefined;
        }),
        http.get('*/api/agents/threads/:threadId/runs', ({ params }) => {
          const id = params.threadId as string;
          if (id.startsWith('draft:')) {
            draftRunsRequests.push(id);
            return HttpResponse.json({ items: [] });
          }
          return undefined;
        }),
        http.get(abs('/api/agents/threads/:threadId/runs'), ({ params }) => {
          const id = params.threadId as string;
          if (id.startsWith('draft:')) {
            draftRunsRequests.push(id);
            return HttpResponse.json({ items: [] });
          }
          return undefined;
        }),
      );

      renderAt('/agents/threads');

      await user.click(await screen.findByRole('button', { name: 'New thread' }));

      await screen.findByPlaceholderText('Search agents...');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(draftThreadRequests).toHaveLength(0);
      expect(draftRunsRequests).toHaveLength(0);
    });

    it('submits a draft thread and navigates to the created thread', async () => {
      const user = userEvent.setup();
      const existingThread = makeThread();
      registerThreadScenario({ thread: existingThread, runs: [] });
      registerGraphAgents([{ id: 'agent-1', template: 'agent.template.one', title: 'Agent Nimbus' }]);

      const newThreadId = 'thread-new-1';
      const newThread = makeThread({ id: newThreadId, summary: 'Fresh thread', alias: 'alias-new', createdAt: t(500) });

      let requestPayload: unknown = null;
      const postHandler = async ({ request }: { request: Request }) => {
        requestPayload = await request.json();
        return HttpResponse.json({ id: newThreadId }, { status: 201 });
      };

      server.use(
        http.post('*/api/agents/threads', postHandler),
        http.post(abs('/api/agents/threads'), postHandler),
        http.get('*/api/agents/threads', () => HttpResponse.json({ items: [newThread, existingThread] })),
        http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [newThread, existingThread] })),
        http.get('*/api/agents/threads/tree', () => HttpResponse.json(buildTreeResponse([newThread, existingThread]))),
        http.get(abs('/api/agents/threads/tree'), () => HttpResponse.json(buildTreeResponse([newThread, existingThread]))),
        http.get('*/api/agents/threads/:threadId', ({ params }) => {
          if (params.threadId === newThreadId) return HttpResponse.json(newThread);
          if (params.threadId === existingThread.id) return HttpResponse.json(existingThread);
          return new HttpResponse(null, { status: 404 });
        }),
        http.get(abs('/api/agents/threads/:threadId'), ({ params }) => {
          if (params.threadId === newThreadId) return HttpResponse.json(newThread);
          if (params.threadId === existingThread.id) return HttpResponse.json(existingThread);
          return new HttpResponse(null, { status: 404 });
        }),
        http.get('*/api/agents/threads/:threadId/runs', () => HttpResponse.json({ items: [] })),
        http.get(abs('/api/agents/threads/:threadId/runs'), () => HttpResponse.json({ items: [] })),
        http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
        http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
        http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
        http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
      );

      renderAt('/agents/threads');

      await user.click(await screen.findByRole('button', { name: 'New thread' }));
      const searchInput = await screen.findByPlaceholderText('Search agents...');
      await user.click(await screen.findByRole('button', { name: 'Agent Nimbus' }));
      await waitFor(() => expect(searchInput).toHaveValue('Agent Nimbus'));

      const editor = await findComposerEditor();
      await user.type(editor, 'Hello new thread');
      await user.click(screen.getByTitle('Send message'));

      await waitFor(() => expect(requestPayload).not.toBeNull());
      expect(requestPayload).toEqual({ agentNodeId: 'agent-1', text: 'Hello new thread' });

      await screen.findByRole('heading', { name: 'Fresh thread' });

      expect(notifyMocks.error).not.toHaveBeenCalled();
      expect(within(screen.getByTestId('threads-list')).queryByText('(new conversation)')).not.toBeInTheDocument();
    });

    it.each([
      { status: 400, code: 'bad_message_payload', message: 'Please enter a message up to 8000 characters.' },
      { status: 404, code: 'parent_not_found', message: 'Parent thread not found. It may have been removed.' },
      { status: 503, code: 'agent_unavailable', message: 'Agent is not currently available for new threads.' },
      { status: 503, code: 'agent_unready', message: 'Agent is starting up. Try again shortly.' },
      { status: 500, code: 'create_failed', message: 'Failed to create the thread. Please retry.' },
    ])('surfaces creation errors for %s responses', async ({ status, code, message }) => {
      const user = userEvent.setup();
      const thread = makeThread();
      registerThreadScenario({ thread, runs: [] });
      registerGraphAgents([{ id: 'agent-1', template: 'agent.template.one', title: 'Agent Nimbus' }]);

      const postHandler = async () => HttpResponse.json({ error: code }, { status });

      server.use(
        http.post('*/api/agents/threads', postHandler),
        http.post(abs('/api/agents/threads'), postHandler),
      );

      renderAt('/agents/threads');

      await user.click(await screen.findByRole('button', { name: 'New thread' }));
      await user.click(await screen.findByRole('button', { name: 'Agent Nimbus' }));
      const editor = await findComposerEditor();
      await user.type(editor, 'Hello new thread');
      const sendButton = screen.getByTitle('Send message');
      await user.click(sendButton);

      await waitFor(() => expect(notifyMocks.error).toHaveBeenCalled());
      expect(notifyMocks.error).toHaveBeenCalledWith(message);

      expect(within(screen.getByTestId('threads-list')).getByText('(new conversation)')).toBeInTheDocument();
      await waitFor(() => expect(sendButton).toBeEnabled());
    });

    it('disables the send button while thread creation is pending', async () => {
      const user = userEvent.setup();
      const thread = makeThread();
      registerThreadScenario({ thread, runs: [] });
      registerGraphAgents([{ id: 'agent-1', template: 'agent.template.one', title: 'Agent Nimbus' }]);

      const newThreadId = 'thread-new-2';
      const newThread = makeThread({ id: newThreadId, summary: 'Pending thread', alias: 'alias-pending', createdAt: t(600) });

      let resolvePost: (() => void) | null = null;
      const postHandler = () =>
        new Promise<HttpResponse>((resolve) => {
          resolvePost = () => resolve(HttpResponse.json({ id: newThreadId }, { status: 201 }));
        });

      server.use(
        http.post('*/api/agents/threads', postHandler),
        http.post(abs('/api/agents/threads'), postHandler),
        http.get('*/api/agents/threads', () => HttpResponse.json({ items: [newThread, thread] })),
        http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [newThread, thread] })),
        http.get('*/api/agents/threads/tree', () => HttpResponse.json(buildTreeResponse([newThread, thread]))),
        http.get(abs('/api/agents/threads/tree'), () => HttpResponse.json(buildTreeResponse([newThread, thread]))),
        http.get('*/api/agents/threads/:threadId', ({ params }) => {
          if (params.threadId === newThreadId) return HttpResponse.json(newThread);
          if (params.threadId === thread.id) return HttpResponse.json(thread);
          return new HttpResponse(null, { status: 404 });
        }),
        http.get(abs('/api/agents/threads/:threadId'), ({ params }) => {
          if (params.threadId === newThreadId) return HttpResponse.json(newThread);
          if (params.threadId === thread.id) return HttpResponse.json(thread);
          return new HttpResponse(null, { status: 404 });
        }),
        http.get('*/api/agents/threads/:threadId/runs', () => HttpResponse.json({ items: [] })),
        http.get(abs('/api/agents/threads/:threadId/runs'), () => HttpResponse.json({ items: [] })),
        http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
        http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
        http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
        http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
      );

      renderAt('/agents/threads');

      await user.click(await screen.findByRole('button', { name: 'New thread' }));
      await user.click(await screen.findByRole('button', { name: 'Agent Nimbus' }));
      const editor = await findComposerEditor();
      await user.type(editor, 'Waiting thread');
      const sendButton = screen.getByTitle('Send message');
      await user.click(sendButton);

      await waitFor(() => expect(sendButton).toBeDisabled());

      expect(resolvePost).toBeTruthy();
      await act(async () => {
        resolvePost?.();
      });

      await screen.findByRole('heading', { name: 'Pending thread' });
    });
  });
});
