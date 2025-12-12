import React from 'react';
import { describe, it, beforeAll, afterAll, afterEach, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor, act, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import { makeDraftKey } from '@/utils/draftStorage';
import { UserContext } from '@/user/user.runtime';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/MarkdownComposer', () => ({
  MarkdownComposer: ({
    value,
    onChange,
    onSend,
    sendDisabled,
    isSending,
    textareaProps,
  }: {
    value: string;
    onChange?: (next: string) => void;
    onSend?: () => void;
    sendDisabled?: boolean;
    isSending?: boolean;
    textareaProps?: { maxLength?: number };
  }) => (
    <div>
      <textarea
        data-testid="mock-markdown-composer"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        maxLength={textareaProps?.maxLength}
      />
      <button
        type="button"
        aria-label="Send message"
        onClick={() => onSend?.()}
        disabled={Boolean(sendDisabled || isSending)}
      >
        Send
      </button>
    </div>
  ),
}));

type ThreadFixture = {
  id: string;
  summary: string;
  createdAt: string;
};

const THREAD_FIXTURES: ThreadFixture[] = [
  { id: 'thread-1', summary: 'Thread One Summary', createdAt: '2024-05-01T10:00:00.000Z' },
  { id: 'thread-2', summary: 'Thread Two Summary', createdAt: '2024-05-02T11:00:00.000Z' },
];

const DEFAULT_METRICS = { remindersCount: 0, containersCount: 0, runsCount: 0, activity: 'idle' as const };

function registerThreadHandlers(overrides?: {
  onSendMessage?: (threadId: string, text: string) => void;
}) {
  const listItems = THREAD_FIXTURES.map((fixture) => ({
    id: fixture.id,
    alias: `${fixture.id}-alias`,
    summary: fixture.summary,
    status: 'open',
    createdAt: fixture.createdAt,
    parentId: null,
    metrics: DEFAULT_METRICS,
    agentRole: 'Agent',
    agentName: `Agent ${fixture.id}`,
  }));

  const treeItems = listItems.map((item) => ({ ...item, children: [], hasChildren: false }));
  const itemById = new Map(listItems.map((item) => [item.id, item] as const));

  const handlers = [
    http.get('/api/agents/threads', () => HttpResponse.json({ items: listItems })),
    http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: listItems })),
    http.get('/api/agents/threads/tree', () => HttpResponse.json({ items: treeItems })),
    http.get(abs('/api/agents/threads/tree'), () => HttpResponse.json({ items: treeItems })),
    http.get('/api/agents/threads/:threadId', ({ params }) => {
      const item = itemById.get(params.threadId as string) ?? listItems[0];
      return HttpResponse.json(item);
    }),
    http.get(abs('/api/agents/threads/:threadId'), ({ params }) => {
      const item = itemById.get(params.threadId as string) ?? listItems[0];
      return HttpResponse.json(item);
    }),
    http.get('/api/agents/threads/:threadId/runs', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/agents/threads/:threadId/runs'), () => HttpResponse.json({ items: [] })),
    http.get('/api/agents/threads/:threadId/children', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/agents/threads/:threadId/children'), () => HttpResponse.json({ items: [] })),
    http.get('/api/agents/threads/:threadId/queued-messages', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/agents/threads/:threadId/queued-messages'), () => HttpResponse.json({ items: [] })),
    http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    http.get('/api/containers', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    http.post('/api/agents/threads/:threadId/messages', async ({ params, request }) => {
      const body = (await request.json().catch(() => ({}))) as { text?: string };
      overrides?.onSendMessage?.(params.threadId as string, body.text ?? '');
      return HttpResponse.json({ ok: true });
    }),
    http.post(abs('/api/agents/threads/:threadId/messages'), async ({ params, request }) => {
      const body = (await request.json().catch(() => ({}))) as { text?: string };
      overrides?.onSendMessage?.(params.threadId as string, body.text ?? '');
      return HttpResponse.json({ ok: true });
    }),
  ];

  server.use(...handlers);
}

beforeAll(() => server.listen());

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  navigateMock.mockReset();
  window.localStorage.clear();
  server.resetHandlers();
});

afterAll(() => server.close());

const TEST_USER = { name: 'Casey Brooks', email: 'casey@example.com' };

function renderThreads(): RenderResult {
  return render(
    <TestProviders>
      <UserContext.Provider value={{ user: TEST_USER }}>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </UserContext.Provider>
    </TestProviders>,
  );
}

const getComposerInput = () => screen.getByTestId('mock-markdown-composer') as HTMLTextAreaElement;

const typeComposer = async (text: string) => {
  const input = getComposerInput();
  const user = userEvent.setup();
  await user.clear(input);
  if (text.length > 0) {
    await user.type(input, text);
  }
  await waitFor(() => {
    expect(input.value).toBe(text);
  });
};

const readComposerValue = () => getComposerInput().value;

const clickThread = async (summary: string) => {
  const list = await screen.findByTestId('threads-list');
  const label = await within(list).findByText(summary);
  const user = userEvent.setup();
  await user.click(label);
};

const waitForDraftPersist = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });

describe('AgentsThreads draft persistence', () => {
  it('persists drafts per thread and restores them after reload', async () => {
    registerThreadHandlers();
    const initial = renderThreads();

    await screen.findByText('Thread One Summary');

    await clickThread('Thread One Summary');

    await typeComposer('First draft message');

    await waitForDraftPersist();

    const key = makeDraftKey('thread-1', TEST_USER.email);
    const stored = window.localStorage.getItem(key);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!) as { text: string };
    expect(parsed.text).toBe('First draft message');

    initial.unmount();

    const rerendered = renderThreads();
    await clickThread('Thread One Summary');

    await waitFor(() => {
      expect(readComposerValue()).toBe('First draft message');
    });

    rerendered.unmount();
  });

  it('keeps separate drafts for different threads', async () => {
    registerThreadHandlers();
    renderThreads();

    await clickThread('Thread One Summary');
    await typeComposer('Draft for one');

    await waitForDraftPersist();

    await clickThread('Thread Two Summary');
    expect(readComposerValue()).toBe('');

    await typeComposer('Draft for two');
    await waitForDraftPersist();

    await clickThread('Thread One Summary');
    expect(window.localStorage.getItem(makeDraftKey('thread-1', TEST_USER.email))).not.toBeNull();
    await waitFor(() => {
      expect(readComposerValue()).toBe('Draft for one');
    });

    await clickThread('Thread Two Summary');
    await waitFor(() => {
      expect(readComposerValue()).toBe('Draft for two');
    });
  });

  it('clears the persisted draft after a successful send', async () => {
    const sendSpy = vi.fn();
    registerThreadHandlers({ onSendMessage: sendSpy });
    renderThreads();

    await clickThread('Thread One Summary');
    await typeComposer('Ready to send');

    await waitForDraftPersist();

    const sendButton = await screen.findByLabelText('Send message');
    const user = userEvent.setup();
    await user.click(sendButton);

    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledWith('thread-1', 'Ready to send');
    });

    await waitFor(() => {
      const key = makeDraftKey('thread-1', TEST_USER.email);
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(readComposerValue()).toBe('');
    });
  });

  it('removes the stored draft when the composer is cleared', async () => {
    registerThreadHandlers();
    renderThreads();

    await clickThread('Thread One Summary');
    await typeComposer('Temporary note');

    await waitForDraftPersist();

    const key = makeDraftKey('thread-1', TEST_USER.email);
    expect(window.localStorage.getItem(key)).not.toBeNull();

    await typeComposer('');

    await waitFor(() => {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(readComposerValue()).toBe('');
    });
  });
});
