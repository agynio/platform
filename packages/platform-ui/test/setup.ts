import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http, type HttpResponseResolver, type PathParams, type RequestHandler } from 'msw';
import type { RunTimelineEvent, RunTimelineEventsCursor, RunTimelineSummary } from '@/api/types/agents';

type CursorKey = string;

type TimelinePage = {
  cursor: RunTimelineEventsCursor | null;
  items: RunTimelineEvent[];
  nextCursor: RunTimelineEventsCursor | null;
};

type TimelineDefinition = {
  threadId: string;
  pages: TimelinePage[];
  summary?: RunTimelineSummary;
};

const cursorKey = (cursor: RunTimelineEventsCursor | null | undefined): CursorKey => {
  if (!cursor || (!cursor.ts && !cursor.id)) return '__root__';
  return `${cursor.ts ?? ''}::${cursor.id ?? ''}`;
};

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const timelineStore = new Map<string, TimelineDefinition>();

const timestamp = () => new Date().toISOString();

const buildSummary = (runId: string, threadId: string, events: RunTimelineEvent[]): RunTimelineSummary => {
  const countsByType = {
    invocation_message: 0,
    injection: 0,
    llm_call: 0,
    tool_execution: 0,
    summarization: 0,
  } as RunTimelineSummary['countsByType'];

  const countsByStatus = {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0,
  } as RunTimelineSummary['countsByStatus'];

  for (const event of events) {
    countsByType[event.type] = (countsByType[event.type] ?? 0) + 1;
    countsByStatus[event.status] = (countsByStatus[event.status] ?? 0) + 1;
  }

  const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));

  return {
    runId,
    threadId,
    status: sorted.at(-1)?.status ?? 'pending',
    createdAt: sorted[0]?.ts ?? timestamp(),
    updatedAt: sorted.at(-1)?.ts ?? timestamp(),
    firstEventAt: sorted[0]?.ts ?? null,
    lastEventAt: sorted.at(-1)?.ts ?? null,
    countsByType,
    countsByStatus,
    totalEvents: events.length,
  };
};

const mergePages = (pages: TimelinePage[]): RunTimelineEvent[] => pages.flatMap((page) => page.items);

const ensureTimeline = (runId: string) => {
  if (!timelineStore.has(runId)) {
    timelineStore.set(runId, {
      threadId: 'thread-1',
      pages: [
        {
          cursor: null,
          items: [],
          nextCursor: null,
        },
      ],
    });
  }
  return timelineStore.get(runId)!;
};

const setTimeline = (runId: string, definition: TimelineDefinition) => {
  timelineStore.set(runId, {
    threadId: definition.threadId,
    pages: definition.pages.map((page) => ({
      cursor: page.cursor ? clone(page.cursor) : null,
      items: page.items.map((item) => clone(item)),
      nextCursor: page.nextCursor ? clone(page.nextCursor) : null,
    })),
    summary: definition.summary
      ? clone(definition.summary)
      : buildSummary(runId, definition.threadId, mergePages(definition.pages)),
  });
};

const resetTimeline = () => timelineStore.clear();

const findPage = (runId: string, cursor: RunTimelineEventsCursor | null): TimelinePage => {
  const def = ensureTimeline(runId);
  const key = cursorKey(cursor);
  const page = def.pages.find((entry) => cursorKey(entry.cursor) === key);
  if (page) return page;
  return def.pages[0];
};

const getSummary = (runId: string): RunTimelineSummary => {
  const def = ensureTimeline(runId);
  if (!def.summary) {
    def.summary = buildSummary(runId, def.threadId, mergePages(def.pages));
  }
  return clone(def.summary);
};

type TimelineControls = {
  reset(): void;
  prime(input: { runId: string; threadId: string; pages: TimelinePage[]; summary?: RunTimelineSummary }): void;
  snapshot(runId: string): TimelineDefinition | undefined;
};

declare global {
  var __timeline: TimelineControls;
}

Object.defineProperty(globalThis, '__timeline', {
  value: {
    reset: resetTimeline,
    prime: ({ runId, threadId, pages, summary }) => {
      setTimeline(runId, { threadId, pages, summary });
    },
    snapshot: (runId: string) => {
      const def = timelineStore.get(runId);
      return def
        ? {
            threadId: def.threadId,
            pages: def.pages.map((page) => ({
              cursor: page.cursor ? clone(page.cursor) : null,
              items: page.items.map((item) => clone(item)),
              nextCursor: page.nextCursor ? clone(page.nextCursor) : null,
            })),
            summary: def.summary ? clone(def.summary) : undefined,
          }
        : undefined;
    },
  } satisfies TimelineControls,
  writable: false,
  configurable: false,
});

const API_BASE = process.env.VITE_API_BASE_URL ?? 'http://localhost:3010';

const clearMock = (fn: unknown) => {
  if (fn && typeof (fn as { mockClear?: () => void }).mockClear === 'function') {
    (fn as { mockClear: () => void }).mockClear();
  }
};

const resolveEvents: HttpResponseResolver<PathParams<'runId'>, unknown> = ({ params, request }) => {
  const runId = params.runId as string;
  const url = new URL(request.url);
  const cursorTs = url.searchParams.get('cursor[ts]');
  const cursorId = url.searchParams.get('cursor[id]');
  const cursor = cursorTs || cursorId ? { ts: cursorTs ?? undefined, id: cursorId ?? undefined } : null;
  const page = findPage(runId, cursor);
  return HttpResponse.json({
    items: page.items,
    nextCursor: page.nextCursor,
  });
};

const resolveSummary: HttpResponseResolver<PathParams<'runId'>, unknown> = ({ params }) => {
  const runId = params.runId as string;
  return HttpResponse.json(getSummary(runId));
};

const handlers: RequestHandler[] = [
  http.get('/api/agents/runs/:runId/events', resolveEvents),
  http.get('/api/agents/runs/:runId/summary', resolveSummary),
  http.get(new URL('/api/agents/runs/:runId/events', API_BASE).toString(), resolveEvents),
  http.get(new URL('/api/agents/runs/:runId/summary', API_BASE).toString(), resolveSummary),
];

const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({
    onUnhandledRequest: (request, print) => {
      const { pathname } = new URL(request.url);
      if (/^\/api\/agents\/runs\/[^/]+\/(events|summary)$/.test(pathname)) {
        print.error();
      }
    },
  });
});

afterEach(() => {
  server.resetHandlers();
  resetTimeline();
  graphSocketMock.listeners.clear();
  graphSocketMock.stateListeners.clear();
  graphSocketMock.reminderListeners.clear();
  graphSocketMock.threadCreatedListeners.clear();
  graphSocketMock.threadUpdatedListeners.clear();
  graphSocketMock.threadActivityListeners.clear();
  graphSocketMock.threadRemindersListeners.clear();
  graphSocketMock.messageCreatedListeners.clear();
  graphSocketMock.runStatusListeners.clear();
  graphSocketMock.runEventListeners.clear();
  graphSocketMock.connectCallbacks.clear();
  graphSocketMock.reconnectCallbacks.clear();
  graphSocketMock.disconnectCallbacks.clear();
  graphSocketMock.subscribedRooms.clear();
  clearMock(graphSocketMock.subscribe);
  clearMock(graphSocketMock.unsubscribe);
  clearMock(graphSocketMock.connect);
  clearMock(graphSocketMock.isConnected);
  clearMock(graphSocketMock.onNodeStatus);
  clearMock(graphSocketMock.onNodeState);
  clearMock(graphSocketMock.onReminderCount);
  clearMock(graphSocketMock.onThreadCreated);
  clearMock(graphSocketMock.onThreadUpdated);
  clearMock(graphSocketMock.onThreadActivityChanged);
  clearMock(graphSocketMock.onThreadRemindersCount);
  clearMock(graphSocketMock.onMessageCreated);
  clearMock(graphSocketMock.onRunEvent);
  clearMock(graphSocketMock.onRunStatusChanged);
  clearMock(graphSocketMock.onConnected);
  clearMock(graphSocketMock.onReconnected);
  clearMock(graphSocketMock.onDisconnected);
  clearMock(fakeSocket.on);
  clearMock(fakeSocket.emit);
  if (fakeSocket.io && typeof fakeSocket.io === 'object') {
    clearMock((fakeSocket.io as { on?: unknown }).on);
  }
});

afterAll(() => {
  server.close();
});

class SingleShotIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;

  readonly rootMargin = '0px';

  readonly thresholds = [0];

  private hasEmitted = false;

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element) {
    if (this.hasEmitted) return;
    this.hasEmitted = true;
    queueMicrotask(() => {
      this.callback([{ isIntersecting: false, intersectionRatio: 0, target } as IntersectionObserverEntry], this);
    });
  }

  unobserve() {}

  disconnect() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: SingleShotIntersectionObserver,
  });

  let rafCounter = 0;
  const rafQueue = new Map<number, FrameRequestCallback>();

  const requestAnimationFrameStub = (callback: FrameRequestCallback): number => {
    rafCounter += 1;
    const id = rafCounter;
    rafQueue.set(id, callback);
    queueMicrotask(() => {
      const cb = rafQueue.get(id);
      if (!cb) return;
      rafQueue.delete(id);
      cb(performance.now());
    });
    return id;
  };

  const cancelAnimationFrameStub = (id: number) => {
    rafQueue.delete(id);
  };

  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: requestAnimationFrameStub,
  });

  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: cancelAnimationFrameStub,
  });
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
} else if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

const fakeSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  io: { on: vi.fn() },
  connected: true,
};

type ListenerSet<T> = Set<(payload: T) => void>;

const graphSocketMock = {
  listeners: new Map<string, ListenerSet<{ nodeId: string }>>(),
  stateListeners: new Map<string, ListenerSet<{ nodeId: string }>>(),
  reminderListeners: new Map<string, ListenerSet<{ nodeId: string }>>(),
  threadCreatedListeners: new Set<(payload: unknown) => void>(),
  threadUpdatedListeners: new Set<(payload: unknown) => void>(),
  threadActivityListeners: new Set<(payload: unknown) => void>(),
  threadRemindersListeners: new Set<(payload: unknown) => void>(),
  messageCreatedListeners: new Set<(payload: unknown) => void>(),
  runStatusListeners: new Set<(payload: unknown) => void>(),
  runEventListeners: new Set<(payload: unknown) => void>(),
  connectCallbacks: new Set<() => void>(),
  reconnectCallbacks: new Set<() => void>(),
  disconnectCallbacks: new Set<() => void>(),
  subscribedRooms: new Set<string>(),
  subscribe: vi.fn((rooms: string[]) => {
    rooms.forEach((room) => graphSocketMock.subscribedRooms.add(room));
  }),
  unsubscribe: vi.fn((rooms: string[]) => {
    rooms.forEach((room) => graphSocketMock.subscribedRooms.delete(room));
  }),
  connect: vi.fn(() => fakeSocket),
  isConnected: vi.fn(() => true),
  onNodeStatus: vi.fn((nodeId: string, cb: (payload: any) => void) => {
    let set = graphSocketMock.listeners.get(nodeId);
    if (!set) {
      set = new Set();
      graphSocketMock.listeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) graphSocketMock.listeners.delete(nodeId);
    };
  }),
  onNodeState: vi.fn((nodeId: string, cb: (payload: any) => void) => {
    let set = graphSocketMock.stateListeners.get(nodeId);
    if (!set) {
      set = new Set();
      graphSocketMock.stateListeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) graphSocketMock.stateListeners.delete(nodeId);
    };
  }),
  onReminderCount: vi.fn((nodeId: string, cb: (payload: any) => void) => {
    let set = graphSocketMock.reminderListeners.get(nodeId);
    if (!set) {
      set = new Set();
      graphSocketMock.reminderListeners.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) graphSocketMock.reminderListeners.delete(nodeId);
    };
  }),
  onThreadCreated: vi.fn((cb: (payload: unknown) => void) => {
    graphSocketMock.threadCreatedListeners.add(cb);
    return () => graphSocketMock.threadCreatedListeners.delete(cb);
  }),
  onThreadUpdated: vi.fn((cb: (payload: unknown) => void) => {
    graphSocketMock.threadUpdatedListeners.add(cb);
    return () => graphSocketMock.threadUpdatedListeners.delete(cb);
  }),
  onThreadActivityChanged: vi.fn((cb: (payload: unknown) => void) => {
    graphSocketMock.threadActivityListeners.add(cb);
    return () => graphSocketMock.threadActivityListeners.delete(cb);
  }),
  onThreadRemindersCount: vi.fn((cb: (payload: unknown) => void) => {
    graphSocketMock.threadRemindersListeners.add(cb);
    return () => graphSocketMock.threadRemindersListeners.delete(cb);
  }),
  onMessageCreated: vi.fn((cb: (payload: unknown) => void) => {
    graphSocketMock.messageCreatedListeners.add(cb);
    return () => graphSocketMock.messageCreatedListeners.delete(cb);
  }),
  onRunEvent: vi.fn((cb: (payload: unknown) => void) => {
    graphSocketMock.runEventListeners.add(cb);
    return () => graphSocketMock.runEventListeners.delete(cb);
  }),
  onRunStatusChanged: vi.fn((cb: (payload: unknown) => void) => {
    graphSocketMock.runStatusListeners.add(cb);
    return () => graphSocketMock.runStatusListeners.delete(cb);
  }),
  onConnected: vi.fn((cb: () => void) => {
    graphSocketMock.connectCallbacks.add(cb);
    return () => graphSocketMock.connectCallbacks.delete(cb);
  }),
  onReconnected: vi.fn((cb: () => void) => {
    graphSocketMock.reconnectCallbacks.add(cb);
    return () => graphSocketMock.reconnectCallbacks.delete(cb);
  }),
  onDisconnected: vi.fn((cb: () => void) => {
    graphSocketMock.disconnectCallbacks.add(cb);
    return () => graphSocketMock.disconnectCallbacks.delete(cb);
  }),
};

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: graphSocketMock,
}));
