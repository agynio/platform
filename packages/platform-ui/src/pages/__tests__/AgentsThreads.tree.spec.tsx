import React from 'react';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../AgentsThreads';
import { TestProviders, server, abs } from '../../../__tests__/integration/testUtils';

type ThreadMock = {
  id: string;
  alias: string;
  summary: string;
  status: 'open' | 'closed';
  createdAt: string;
  parentId: string | null;
  metrics: { remindersCount: number; containersCount: number; activity: 'idle' | 'waiting' | 'working'; runsCount: number };
  agentRole?: string | null;
  agentName?: string | null;
  children?: ThreadMock[];
  hasChildren?: boolean;
};

const BASE_TIME = 1700000000000;

const originalIntersectionObserver = globalThis.IntersectionObserver;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(entries: Partial<IntersectionObserverEntry>[] = [{ isIntersecting: true }]) {
    const normalized = entries.map((entry) =>
      ({
        time: 0,
        target: document.body,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        ...entry,
      }) as IntersectionObserverEntry,
    );
    this.callback(normalized, this as unknown as IntersectionObserver);
  }

  static reset() {
    MockIntersectionObserver.instances.length = 0;
  }
}

function t(offset: number): string {
  return new Date(BASE_TIME + offset).toISOString();
}

function makeThread(overrides: Partial<ThreadMock> = {}): ThreadMock {
  return {
    id: 'thread-1',
    alias: 'alias-1',
    summary: 'Thread',
    status: 'open',
    createdAt: t(0),
    parentId: null,
    metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 },
    agentRole: 'Role',
    agentName: 'Agent Name',
    children: undefined,
    hasChildren: undefined,
    ...overrides,
  };
}

function buildTreeResponse(threads: ThreadMock[]): { items: ThreadMock[] } {
  return {
    items: threads.map((thread) => ({
      ...thread,
      children: thread.children?.map((child) => ({ ...child })),
    })),
  };
}

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

describe('AgentsThreads tree preload', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
    (globalThis as typeof globalThis & { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    if (typeof window !== 'undefined') {
      (window as typeof window & { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
        MockIntersectionObserver as unknown as typeof IntersectionObserver;
    }
  });

  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
    MockIntersectionObserver.reset();
  });

  afterAll(() => {
    server.close();
    if (originalIntersectionObserver) {
      globalThis.IntersectionObserver = originalIntersectionObserver;
      if (typeof window !== 'undefined') {
        window.IntersectionObserver = originalIntersectionObserver;
      }
    } else {
      delete (globalThis as Partial<typeof globalThis>).IntersectionObserver;
      if (typeof window !== 'undefined') {
        delete (window as Partial<typeof window>).IntersectionObserver;
      }
    }
  });

  it('preloads root and first-level children from tree response', async () => {
    const root = makeThread({ id: 'root-1', summary: 'Root Thread' });
    const child = makeThread({ id: 'child-1', parentId: root.id, summary: 'Child Thread', createdAt: t(10) });
    const grandchild = makeThread({ id: 'grand-1', parentId: child.id, summary: 'Grandchild Thread', createdAt: t(20) });

    let childrenRequests = 0;

    server.use(
      http.get('*/api/agents/threads/tree', () =>
        HttpResponse.json(
          buildTreeResponse([
            {
              ...root,
              hasChildren: true,
              children: [
                {
                  ...child,
                  hasChildren: true,
                  children: [
                    {
                      ...grandchild,
                      hasChildren: false,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ]),
        ),
      ),
      http.get(abs('/api/agents/threads/tree'), () =>
        HttpResponse.json(
          buildTreeResponse([
            {
              ...root,
              hasChildren: true,
              children: [
                {
                  ...child,
                  hasChildren: true,
                  children: [
                    {
                      ...grandchild,
                      hasChildren: false,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ]),
        ),
      ),
      http.get('*/api/agents/threads', () => HttpResponse.json({ items: [root] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [root] })),
      http.get('*/api/agents/threads/:threadId', () => HttpResponse.json(root)),
      http.get(abs('/api/agents/threads/:threadId'), () => HttpResponse.json(root)),
      http.get('*/api/agents/threads/:threadId/children', () => {
        childrenRequests += 1;
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/threads/:threadId/children'), () => {
        childrenRequests += 1;
        return HttpResponse.json({ items: [] });
      }),
      http.get('*/api/agents/threads/:threadId/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/:threadId/runs'), () => HttpResponse.json({ items: [] })),
      http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.options('*/api/agents/reminders', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 200 })),
      http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
      http.options('*/api/containers', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/containers'), () => new HttpResponse(null, { status: 200 })),
      http.options('*/api/containers', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/containers'), () => new HttpResponse(null, { status: 200 })),
      http.options('*/api/containers', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/containers'), () => new HttpResponse(null, { status: 200 })),
    );

    const user = userEvent.setup();
    renderAt('/agents/threads');

    const rootToggle = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(rootToggle);
    expect(await screen.findByText('Child Thread')).toBeInTheDocument();
    expect(childrenRequests).toBe(0);

    const childToggle = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(childToggle);
    expect(await screen.findByText('Grandchild Thread')).toBeInTheDocument();
    expect(childrenRequests).toBe(0);
  });

  it('fetches when expanding beyond preloaded depth', async () => {
    const root = makeThread({ id: 'root-1', summary: 'Root Thread' });
    const child = makeThread({ id: 'child-1', parentId: root.id, summary: 'Child Thread', createdAt: t(10) });
    const grandchild = makeThread({ id: 'grand-1', parentId: child.id, summary: 'Grandchild Thread', createdAt: t(20), hasChildren: true });
    const greatGrandchild = makeThread({ id: 'great-1', parentId: grandchild.id, summary: 'Great Grandchild', createdAt: t(30) });

    let childrenRequests = 0;

    server.use(
      http.get('*/api/agents/threads/tree', () =>
        HttpResponse.json(
          buildTreeResponse([
            {
              ...root,
              hasChildren: true,
              children: [
                {
                  ...child,
                  hasChildren: true,
                  children: [
                    {
                      ...grandchild,
                      hasChildren: true,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ]),
        ),
      ),
      http.get(abs('/api/agents/threads/tree'), () =>
        HttpResponse.json(
          buildTreeResponse([
            {
              ...root,
              hasChildren: true,
              children: [
                {
                  ...child,
                  hasChildren: true,
                  children: [
                    {
                      ...grandchild,
                      hasChildren: true,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ]),
        ),
      ),
      http.get('*/api/agents/threads', () => HttpResponse.json({ items: [root] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [root] })),
      http.get('*/api/agents/threads/:threadId', () => HttpResponse.json(root)),
      http.get(abs('/api/agents/threads/:threadId'), () => HttpResponse.json(root)),
      http.get('*/api/agents/threads/:threadId/children', ({ params }) => {
        childrenRequests += 1;
        if (params.threadId === grandchild.id) {
          return HttpResponse.json({ items: [greatGrandchild] });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/threads/:threadId/children'), ({ params }) => {
        childrenRequests += 1;
        if (params.threadId === grandchild.id) {
          return HttpResponse.json({ items: [greatGrandchild] });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.get('*/api/agents/threads/:threadId/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/:threadId/runs'), () => HttpResponse.json({ items: [] })),
      http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.options('*/api/agents/reminders', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 200 })),
      http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );

    const user = userEvent.setup();
    renderAt('/agents/threads');

    const rootToggle = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(rootToggle);
    const childToggle = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(childToggle);
    expect(await screen.findByText('Grandchild Thread')).toBeInTheDocument();
    expect(childrenRequests).toBe(0);

    const grandchildToggle = await screen.findByRole('button', { name: 'Show subthreads' });
    await user.click(grandchildToggle);

    await waitFor(() => expect(screen.getByText('Great Grandchild')).toBeInTheDocument());
    expect(childrenRequests).toBeGreaterThanOrEqual(1);
  });

  it('removes stale children when later tree responses shrink the list', async () => {
    const root = makeThread({ id: 'root-1', summary: 'Root Thread' });
    const childKeep = makeThread({ id: 'child-keep', parentId: root.id, summary: 'Keep Child', createdAt: t(10) });
    const childDrop = makeThread({ id: 'child-drop', parentId: root.id, summary: 'Drop Child', createdAt: t(20) });

    const extraRoots: ThreadMock[] = Array.from({ length: 49 }).map((_, index) => ({
      ...makeThread({ id: `extra-root-${index}`, summary: `Extra Root ${index}`, createdAt: t(100 + index) }),
      hasChildren: false,
      children: [],
    }));

    const initialItems: ThreadMock[] = [
      {
        ...root,
        hasChildren: true,
        children: [
          {
            ...childKeep,
            hasChildren: false,
            children: [],
          },
          {
            ...childDrop,
            hasChildren: false,
            children: [],
          },
        ],
      },
      ...extraRoots,
    ];

    const updatedItems: ThreadMock[] = [
      {
        ...root,
        hasChildren: true,
        children: [
          {
            ...childKeep,
            hasChildren: false,
            children: [],
          },
        ],
      },
      ...extraRoots,
    ];

    let childrenRequests = 0;

    server.use(
      http.get('*/api/agents/threads/tree', ({ request }) => {
        const url = new URL(request.url);
        const limit = Number.parseInt(url.searchParams.get('limit') ?? '0', 10);
        if (!Number.isFinite(limit) || limit <= 50) {
          return HttpResponse.json(buildTreeResponse(initialItems));
        }
        return HttpResponse.json(buildTreeResponse(updatedItems));
      }),
      http.get(abs('/api/agents/threads/tree'), ({ request }) => {
        const url = new URL(request.url);
        const limit = Number.parseInt(url.searchParams.get('limit') ?? '0', 10);
        if (!Number.isFinite(limit) || limit <= 50) {
          return HttpResponse.json(buildTreeResponse(initialItems));
        }
        return HttpResponse.json(buildTreeResponse(updatedItems));
      }),
      http.get('*/api/agents/threads', () => HttpResponse.json({ items: updatedItems })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: updatedItems })),
      http.get('*/api/agents/threads/:threadId', ({ params }) => {
        const match = updatedItems.find((item) => item.id === params.threadId);
        if (match) return HttpResponse.json(match);
        return new HttpResponse(null, { status: 404 });
      }),
      http.get(abs('/api/agents/threads/:threadId'), ({ params }) => {
        const match = updatedItems.find((item) => item.id === params.threadId);
        if (match) return HttpResponse.json(match);
        return new HttpResponse(null, { status: 404 });
      }),
      http.get('*/api/agents/threads/:threadId/children', () => {
        childrenRequests += 1;
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/threads/:threadId/children'), () => {
        childrenRequests += 1;
        return HttpResponse.json({ items: [] });
      }),
      http.get('*/api/agents/threads/:threadId/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/:threadId/runs'), () => HttpResponse.json({ items: [] })),
      http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.options('*/api/agents/reminders', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 200 })),
      http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );

    const user = userEvent.setup();
    renderAt('/agents/threads');

    const rootToggle = await screen.findByRole('button', { name: /Show 2 subthreads/i });
    await user.click(rootToggle);

    expect(await screen.findByText('Keep Child')).toBeInTheDocument();
    expect(await screen.findByText('Drop Child')).toBeInTheDocument();

    act(() => {
      MockIntersectionObserver.instances.forEach((instance) => instance.trigger());
    });

    await waitFor(() => expect(screen.queryByText('Drop Child')).not.toBeInTheDocument());
    expect(screen.getByText('Keep Child')).toBeInTheDocument();
    expect(childrenRequests).toBe(0);
  });

  it('merges children state when pagination extends the tree', async () => {
    const primaryRoot = makeThread({ id: 'root-primary', summary: 'Primary Root', createdAt: t(0) });
    const primaryChild = makeThread({ id: 'child-primary', parentId: primaryRoot.id, summary: 'Primary Child', createdAt: t(10) });
    const extraRoots = Array.from({ length: 49 }).map((_, index) =>
      makeThread({ id: `root-${index}`, summary: `Root ${index}`, createdAt: t(100 + index * 10) }),
    );
    const pageOneItems: ThreadMock[] = [
      {
        ...primaryRoot,
        hasChildren: true,
        children: [
          {
            ...primaryChild,
            hasChildren: false,
            children: [],
          },
        ],
      },
      ...extraRoots.map((thread) => ({ ...thread, hasChildren: false, children: [] })),
    ];

    const newRoot = makeThread({ id: 'root-new', summary: 'New Root', createdAt: t(1000) });
    const newChild = makeThread({ id: 'child-new', parentId: newRoot.id, summary: 'New Child', createdAt: t(1010) });
    const pageTwoItems: ThreadMock[] = [
      {
        ...primaryRoot,
        hasChildren: true,
        children: [
          {
            ...primaryChild,
            hasChildren: false,
            children: [],
          },
        ],
      },
      ...extraRoots.map((thread) => ({ ...thread, hasChildren: false, children: [] })),
      {
        ...newRoot,
        hasChildren: true,
        children: [
          {
            ...newChild,
            hasChildren: false,
            children: [],
          },
        ],
      },
    ];

    let childrenRequests = 0;

    server.use(
      http.get('*/api/agents/threads/tree', ({ request }) => {
        const url = new URL(request.url);
        const limit = Number.parseInt(url.searchParams.get('limit') ?? '0', 10);
        if (!Number.isFinite(limit) || limit <= 50) {
          return HttpResponse.json(buildTreeResponse(pageOneItems));
        }
        return HttpResponse.json(buildTreeResponse(pageTwoItems));
      }),
      http.get(abs('/api/agents/threads/tree'), ({ request }) => {
        const url = new URL(request.url);
        const limit = Number.parseInt(url.searchParams.get('limit') ?? '0', 10);
        if (!Number.isFinite(limit) || limit <= 50) {
          return HttpResponse.json(buildTreeResponse(pageOneItems));
        }
        return HttpResponse.json(buildTreeResponse(pageTwoItems));
      }),
      http.get('*/api/agents/threads', () => HttpResponse.json({ items: pageTwoItems })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: pageTwoItems })),
      http.get('*/api/agents/threads/:threadId', ({ params }) => {
        const match = pageTwoItems.find((item) => item.id === params.threadId);
        if (match) return HttpResponse.json(match);
        return new HttpResponse(null, { status: 404 });
      }),
      http.get(abs('/api/agents/threads/:threadId'), ({ params }) => {
        const match = pageTwoItems.find((item) => item.id === params.threadId);
        if (match) return HttpResponse.json(match);
        return new HttpResponse(null, { status: 404 });
      }),
      http.get('*/api/agents/threads/:threadId/children', () => {
        childrenRequests += 1;
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/threads/:threadId/children'), () => {
        childrenRequests += 1;
        return HttpResponse.json({ items: [] });
      }),
      http.get('*/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.options('*/api/agents/reminders', () => new HttpResponse(null, { status: 200 })),
      http.options(abs('/api/agents/reminders'), () => new HttpResponse(null, { status: 200 })),
      http.get('*/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );

    const user = userEvent.setup();
    renderAt('/agents/threads');

    const rootToggle = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(rootToggle);
    expect(await screen.findByText('Primary Child')).toBeInTheDocument();

    act(() => {
      MockIntersectionObserver.instances.forEach((instance) => instance.trigger());
    });

    await waitFor(() => expect(screen.getByText('New Root')).toBeInTheDocument());

    expect(childrenRequests).toBe(0);

    const newRootToggle = await screen.findByRole('button', { name: /Show 1 subthread/i });
    await user.click(newRootToggle);

    expect(await screen.findByText('New Child')).toBeInTheDocument();

    const primaryChildVisible = screen.getByText('Primary Child');
    expect(primaryChildVisible).toBeInTheDocument();
  });
});
