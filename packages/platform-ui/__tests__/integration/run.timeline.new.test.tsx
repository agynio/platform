import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TestProviders, abs, server } from '../integration/testUtils';
import { AgentsRunTimeline } from '../../src/pages/AgentsRunTimeline';

const renderSpy = vi.fn();
const terminateSpy = vi.fn();

vi.mock('@agyn/ui-new', async () => {
  const actual = await vi.importActual<any>('@agyn/ui-new');
  return {
    ...actual,
    RunScreen: (props: Parameters<typeof actual.RunScreen>[0]) => {
      renderSpy(props);
      return <div data-testid="run-screen" />;
    },
  };
});

const graphSocketStub = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  setRunCursor: vi.fn(),
  getRunCursor: vi.fn(() => null),
  dispose: vi.fn(),
  onRunEvent: () => () => {},
  onRunStatusChanged: () => () => {},
  onThreadRemindersCount: () => () => {},
  onReconnected: () => () => {},
  onToolOutputChunk: () => () => {},
  onToolOutputTerminal: () => () => {},
}));

vi.mock('@/lib/graph/socket', () => ({ graphSocket: graphSocketStub }));

function setupRunApi() {
  const runId = 'run-1';
  const threadId = '00000000-0000-0000-0000-000000000001';
  const baseTime = 1700000000000;

  const summaryResponse = {
    runId,
    threadId,
    status: 'finished',
    createdAt: new Date(baseTime).toISOString(),
    updatedAt: new Date(baseTime + 5000).toISOString(),
    firstEventAt: new Date(baseTime + 1000).toISOString(),
    lastEventAt: new Date(baseTime + 4000).toISOString(),
    countsByType: {
      invocation_message: 1,
      injection: 0,
      llm_call: 1,
      tool_execution: 1,
      summarization: 0,
    },
    countsByStatus: {
      pending: 0,
      running: 0,
      success: 3,
      error: 0,
      cancelled: 0,
    },
    totalEvents: 3,
  };
  const eventsResponse = {
    items: [
      {
        id: 'evt-message',
        runId,
        threadId,
        type: 'invocation_message',
        status: 'success',
        ts: new Date(baseTime + 1000).toISOString(),
        startedAt: null,
        endedAt: null,
        durationMs: null,
        nodeId: null,
        sourceKind: 'runtime',
        sourceSpanId: null,
        metadata: null,
        errorCode: null,
        errorMessage: null,
        message: {
          messageId: 'msg-1',
          role: 'user',
          kind: 'input',
          text: 'Hello',
          source: null,
          createdAt: new Date(baseTime + 1000).toISOString(),
        },
        attachments: [],
      },
      {
        id: 'evt-llm',
        runId,
        threadId,
        type: 'llm_call',
        status: 'success',
        ts: new Date(baseTime + 2000).toISOString(),
        startedAt: null,
        endedAt: null,
        durationMs: 500,
        nodeId: null,
        sourceKind: 'runtime',
        sourceSpanId: null,
        metadata: null,
        errorCode: null,
        errorMessage: null,
        llmCall: {
          provider: 'openai',
          model: 'gpt-4.1',
          temperature: 0,
          topP: null,
          stopReason: null,
          contextItemIds: [],
          responseText: 'Hi there',
          rawResponse: null,
          toolCalls: [],
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, reasoningTokens: 0, totalTokens: 15 },
        },
        attachments: [],
      },
      {
        id: 'evt-tool',
        runId,
        threadId,
        type: 'tool_execution',
        status: 'success',
        ts: new Date(baseTime + 3000).toISOString(),
        startedAt: new Date(baseTime + 3000).toISOString(),
        endedAt: new Date(baseTime + 3500).toISOString(),
        durationMs: 500,
        nodeId: null,
        sourceKind: 'runtime',
        sourceSpanId: null,
        metadata: null,
        errorCode: null,
        errorMessage: null,
        toolExecution: {
          toolName: 'shell',
          toolCallId: 'call-1',
          execStatus: 'success',
          input: { command: 'echo' },
          output: { stdout: 'world' },
          errorMessage: null,
          raw: null,
        },
        attachments: [],
      },
    ],
    nextCursor: null,
  };

  const eventsHandler = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    expect(url.searchParams.get('order')).toBe('asc');
    return HttpResponse.json(eventsResponse);
  };

  server.use(
    http.get(`/api/agents/runs/${runId}/summary`, () => HttpResponse.json(summaryResponse)),
    http.get(abs(`/api/agents/runs/${runId}/summary`), () => HttpResponse.json(summaryResponse)),
    http.get(`/api/agents/runs/${runId}/events`, eventsHandler),
    http.get(abs(`/api/agents/runs/${runId}/events`), eventsHandler),
    http.post(`/api/agents/runs/${runId}/terminate`, async () => {
      terminateSpy();
      return HttpResponse.json({ ok: true });
    }),
    http.post(abs(`/api/agents/runs/${runId}/terminate`), async () => {
      terminateSpy();
      return HttpResponse.json({ ok: true });
    }),
    http.options(`/api/agents/runs/${runId}/terminate`, () => new HttpResponse(null, { status: 200 })),
    http.options(abs(`/api/agents/runs/${runId}/terminate`), () => new HttpResponse(null, { status: 200 })),
    http.get(abs(`/api/agents/runs/${runId}/events`), () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get(abs(`/api/agents/runs/${runId}/summary`), () => HttpResponse.json({ totalEvents: 0 })),
  );

  return { runId, threadId };
}

describe('AgentsRunNew', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    renderSpy.mockReset();
    terminateSpy.mockReset();
    for (const value of Object.values(graphSocketStub)) {
      if (typeof value === 'function' && 'mockReset' in value) {
        (value as unknown as { mockReset: () => void }).mockReset();
      }
    }
  });
  afterAll(() => server.close());

  it('maps summary and events for RunScreen', async () => {
    const { runId, threadId } = setupRunApi();

    render(
      <MemoryRouter initialEntries={[`/agents/threads/${threadId}/runs/${runId}/timeline`]}> 
        <Routes>
          <Route
            path="/agents/threads/:threadId/runs/:runId/timeline"
            element={
              <TestProviders>
                <AgentsRunTimeline />
              </TestProviders>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('run-screen');
    await waitFor(() => {
      const props = renderSpy.mock.calls.at(-1)?.[0];
      expect(props?.events).toHaveLength(3);
    });
    const props = renderSpy.mock.calls.at(-1)?.[0];
    expect(props?.runId).toBe(runId);
    expect(props?.status).toBe('finished');
    expect(props?.statistics).toMatchObject({ totalEvents: 3, messages: 1, llm: 1, tools: 1 });
    expect(props?.tokens).toMatchObject({ input: 10, output: 5, total: 15 });
    expect(props?.events).toHaveLength(3);
    expect(props?.events?.[1]?.data?.model).toBe('gpt-4.1');
  });

  it('invokes terminate endpoint when RunScreen onTerminate is triggered', async () => {
    const { runId, threadId } = setupRunApi();

    render(
      <MemoryRouter initialEntries={[`/agents/threads/${threadId}/runs/${runId}/timeline`]}> 
        <Routes>
          <Route
            path="/agents/threads/:threadId/runs/:runId/timeline"
            element={
              <TestProviders>
                <AgentsRunTimeline />
              </TestProviders>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('run-screen');
    const props = renderSpy.mock.calls.at(-1)?.[0];
    const confirmStub = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertStub = vi.spyOn(window, 'alert').mockImplementation(() => {});
    try {
      props?.onTerminate?.();
      await waitFor(() => expect(terminateSpy).toHaveBeenCalled());
    } finally {
      confirmStub.mockRestore();
      alertStub.mockRestore();
    }
  });
});
