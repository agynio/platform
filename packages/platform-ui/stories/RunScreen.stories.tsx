import type { ComponentProps } from 'react';
import { useArgs } from 'storybook/preview-api';
import { action } from 'storybook/actions';
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import RunScreen from '../src/components/screens/RunScreen';
import type { RunEvent } from '../src/components/RunEventsList';
import type { ContextItem, RunTimelineEvent, RunTimelineEventsResponse, RunTimelineSummary, RunEventType, RunEventStatus } from '../src/api/types/agents';
import { aggregateLlmUsage, mapTimelineEventToRunEvent } from '../src/pages/utils/timelineEventToRunEvent';
import { type Status } from '../src/components/StatusIndicator';
import { withMainLayout } from './decorators/withMainLayout';
import { withQueryClient } from './decorators/withQueryClient';

type RunScreenProps = ComponentProps<typeof RunScreen>;

const meta: Meta<typeof RunScreen> = {
  title: 'Screens/Run',
  component: RunScreen,
  decorators: [withQueryClient, withMainLayout],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof RunScreen>;

const SAMPLE_RUN_ID = 'run-001';
const SAMPLE_THREAD_ID = 'thread-001';

const sampleContextItems: ContextItem[] = [
  {
    id: 'ctx-1',
    role: 'user',
    contentText: 'Can you help me implement a secure authentication system?',
    contentJson: null,
    metadata: {},
    sizeBytes: 220,
    createdAt: '2024-07-10T19:34:00.000Z',
  },
  {
    id: 'ctx-2',
    role: 'assistant',
    contentText: null,
    contentJson: {
      plan: ['Outline requirements', 'Draft implementation', 'Review tests'],
    },
    metadata: {},
    sizeBytes: 512,
    createdAt: '2024-07-10T19:34:08.000Z',
  },
  {
    id: 'ctx-3',
    role: 'tool',
    contentText: null,
    contentJson: {
      command: 'pnpm test --filter auth',
      result: 'Passed 24 tests in 3s',
    },
    metadata: {},
    sizeBytes: 640,
    createdAt: '2024-07-10T19:34:12.500Z',
  },
];

const sampleContextItemMap = new Map(sampleContextItems.map((item) => [item.id, item]));

const sampleTimelineEvents: RunTimelineEvent[] = [
  {
    id: 'evt-1',
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    type: 'invocation_message',
    status: 'success',
    ts: '2024-07-10T19:34:12.000Z',
    startedAt: '2024-07-10T19:34:12.000Z',
    endedAt: '2024-07-10T19:34:12.000Z',
    durationMs: 0,
    nodeId: 'node-1',
    sourceKind: 'internal',
    sourceSpanId: 'span-evt-1',
    metadata: null,
    errorCode: null,
    errorMessage: null,
    message: {
      messageId: 'msg-1',
      role: 'user',
      kind: 'source',
      text: 'Can you help me implement a secure authentication system?',
      source: null,
      createdAt: '2024-07-10T19:34:12.000Z',
    },
    attachments: [],
  },
  {
    id: 'evt-2',
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    type: 'llm_call',
    status: 'success',
    ts: '2024-07-10T19:34:15.000Z',
    startedAt: '2024-07-10T19:34:13.000Z',
    endedAt: '2024-07-10T19:34:15.300Z',
    durationMs: 2300,
    nodeId: 'node-2',
    sourceKind: 'internal',
    sourceSpanId: 'span-evt-2',
    metadata: null,
    errorCode: null,
    errorMessage: null,
    llmCall: {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      temperature: 0,
      topP: 1,
      stopReason: 'stop',
      contextItemIds: ['ctx-1', 'ctx-2', 'ctx-3'],
      newContextItemCount: 2,
      responseText:
        "I'll help you implement a comprehensive authentication system. Let's break the work into steps and generate the required files.",
      rawResponse: null,
      toolCalls: [
        {
          callId: 'call-1',
          name: 'file_write',
          arguments: {
            path: '/src/auth/jwt.ts',
            content:
              'import jwt from "jsonwebtoken";\n\nexport function generateToken(payload: any) {\n  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "1h" });\n}',
          },
        },
        {
          callId: 'call-2',
          name: 'shell',
          arguments: {
            command: 'pnpm test --filter auth',
          },
        },
      ],
      usage: {
        inputTokens: 1234,
        cachedInputTokens: 120,
        outputTokens: 856,
        reasoningTokens: 64,
        totalTokens: 2274,
      },
    },
    attachments: [],
  },
  {
    id: 'evt-3',
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    type: 'tool_execution',
    status: 'success',
    ts: '2024-07-10T19:34:17.000Z',
    startedAt: '2024-07-10T19:34:16.000Z',
    endedAt: '2024-07-10T19:34:17.200Z',
    durationMs: 1200,
    nodeId: 'node-3',
    sourceKind: 'internal',
    sourceSpanId: 'span-evt-3',
    metadata: null,
    errorCode: null,
    errorMessage: null,
    toolExecution: {
      toolName: 'file_write',
      toolCallId: 'call-1',
      execStatus: 'success',
      input: {
        path: '/src/auth/jwt.ts',
        content:
          'import jwt from "jsonwebtoken";\n\nexport function generateToken(payload: any) {\n  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "1h" });\n}',
      },
      output: {
        success: true,
        path: '/src/auth/jwt.ts',
        bytesWritten: 234,
      },
      errorMessage: null,
      raw: null,
    },
    attachments: [],
  },
  {
    id: 'evt-4',
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    type: 'tool_execution',
    status: 'success',
    ts: '2024-07-10T19:34:19.200Z',
    startedAt: '2024-07-10T19:34:18.400Z',
    endedAt: '2024-07-10T19:34:19.200Z',
    durationMs: 800,
    nodeId: 'node-4',
    sourceKind: 'internal',
    sourceSpanId: 'span-evt-4',
    metadata: null,
    errorCode: null,
    errorMessage: null,
    toolExecution: {
      toolName: 'shell',
      toolCallId: 'call-2',
      execStatus: 'success',
      input: {
        command: 'pnpm test --filter auth',
        cwd: '/workspace/project',
      },
      output: {
        stdout: 'Running 24 tests...\nAll tests passed.\n',
        exitCode: 0,
      },
      errorMessage: null,
      raw: null,
    },
    attachments: [],
  },
  {
    id: 'evt-4a',
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    type: 'tool_execution',
    status: 'success',
    ts: '2024-07-10T19:34:21.500Z',
    startedAt: '2024-07-10T19:34:18.000Z',
    endedAt: '2024-07-10T19:34:21.500Z',
    durationMs: 3500,
    nodeId: 'node-5',
    sourceKind: 'internal',
    sourceSpanId: 'span-evt-5',
    metadata: null,
    errorCode: null,
    errorMessage: null,
    toolExecution: {
      toolName: 'manage',
      toolCallId: 'call-3',
      execStatus: 'success',
      input: {
        command: 'send_message',
        worker: 'agent-ops',
        message:
          'Deploy the updated authentication service to staging and run integration tests.',
        threadAlias: 'deploy-auth-staging',
      },
      output: {
        success: true,
        subthreadId: 'thread-abc-123',
        runId: 'run-xyz-456',
        message: 'Message sent to worker agent-ops in thread deploy-auth-staging',
      },
      errorMessage: null,
      raw: null,
    },
    attachments: [],
  },
  {
    id: 'evt-5',
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    type: 'summarization',
    status: 'success',
    ts: '2024-07-10T19:34:38.000Z',
    startedAt: '2024-07-10T19:34:36.500Z',
    endedAt: '2024-07-10T19:34:38.300Z',
    durationMs: 1800,
    nodeId: 'node-6',
    sourceKind: 'internal',
    sourceSpanId: 'span-evt-6',
    metadata: null,
    errorCode: null,
    errorMessage: null,
    summarization: {
      summaryText:
        'Implemented JWT-based authentication with OAuth 2.0 integration, added security best practices, and confirmed test coverage for empty secret handling.',
      newContextCount: 2,
      oldContextTokens: 2847,
      raw: null,
    },
    attachments: [],
  },
  {
    id: 'evt-6',
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    type: 'invocation_message',
    status: 'success',
    ts: '2024-07-10T19:34:45.000Z',
    startedAt: '2024-07-10T19:34:45.000Z',
    endedAt: '2024-07-10T19:34:45.000Z',
    durationMs: 0,
    nodeId: 'node-7',
    sourceKind: 'internal',
    sourceSpanId: 'span-evt-7',
    metadata: null,
    errorCode: null,
    errorMessage: null,
    message: {
      messageId: 'msg-2',
      role: 'assistant',
      kind: 'result',
      text:
        'Authentication system implementation complete! All tests passing. JWT token generation, OAuth 2.0 providers, and security best practices are in place.',
      source: null,
      createdAt: '2024-07-10T19:34:45.000Z',
    },
    attachments: [],
  },
];

const sampleRunEventsResponse: RunTimelineEventsResponse = {
  items: sampleTimelineEvents,
  nextCursor: null,
};

const firstTimelineEvent = sampleTimelineEvents[0] ?? null;
const lastTimelineEvent = sampleTimelineEvents.length > 0 ? sampleTimelineEvents[sampleTimelineEvents.length - 1] : null;

const sampleRunSummary: RunTimelineSummary = (() => {
  const countsByType: Record<RunEventType, number> = {
    invocation_message: 0,
    injection: 0,
    llm_call: 0,
    tool_execution: 0,
    summarization: 0,
  };

  const countsByStatus: Record<RunEventStatus, number> = {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0,
  };

  for (const event of sampleTimelineEvents) {
    countsByType[event.type] += 1;
    countsByStatus[event.status] += 1;
  }

  return {
    runId: SAMPLE_RUN_ID,
    threadId: SAMPLE_THREAD_ID,
    status: 'running',
    createdAt: '2024-07-10T19:34:00.000Z',
    updatedAt: '2024-07-10T19:35:00.000Z',
    firstEventAt: firstTimelineEvent ? firstTimelineEvent.ts : null,
    lastEventAt: lastTimelineEvent ? lastTimelineEvent.ts : null,
    countsByType,
    countsByStatus,
    totalEvents: sampleTimelineEvents.length,
  };
})();

const sampleEvents: RunEvent[] = sampleTimelineEvents.map(mapTimelineEventToRunEvent);

const baseTokensAggregate = aggregateLlmUsage(sampleTimelineEvents);

const baseTokens = {
  input: baseTokensAggregate.input,
  cached: baseTokensAggregate.cached,
  output: baseTokensAggregate.output,
  reasoning: baseTokensAggregate.reasoning,
  total: baseTokensAggregate.total,
};

const baseStatistics = {
  totalEvents: sampleEvents.length,
  messages: sampleEvents.filter((event) => event.type === 'message').length,
  llm: sampleEvents.filter((event) => event.type === 'llm').length,
  tools: sampleEvents.filter((event) => event.type === 'tool').length,
  summaries: sampleEvents.filter((event) => event.type === 'summarization').length,
};

const defaultSelectedEventId = sampleEvents.find((event) => event.type === 'llm')?.id ?? sampleEvents[0]?.id ?? null;

const contextItemsHandler = http.get('/api/agents/context-items', ({ request }) => {
  const url = new URL(request.url);
  const ids = url.searchParams.getAll('ids');
  const source = ids.length > 0 ? ids : Array.from(sampleContextItemMap.keys());
  const items = source
    .map((id) => sampleContextItemMap.get(id))
    .filter((item): item is ContextItem => Boolean(item));
  return HttpResponse.json({ items });
});

const runSummaryHandler = http.get('/api/agents/runs/:runId/summary', () => {
  return HttpResponse.json(sampleRunSummary);
});

const runEventsHandler = http.get('/api/agents/runs/:runId/events', () => {
  return HttpResponse.json(sampleRunEventsResponse);
});

const ControlledRender: Story['render'] = () => {
  const [currentArgs, updateArgs] = useArgs<RunScreenProps>();
  const logSelectEvent = action('onSelectEvent');
  const logFollowingChange = action('onFollowingChange');
  const logEventFiltersChange = action('onEventFiltersChange');
  const logStatusFiltersChange = action('onStatusFiltersChange');
  const logTokensPopoverOpenChange = action('onTokensPopoverOpenChange');
  const logRunsPopoverOpenChange = action('onRunsPopoverOpenChange');
  const logLoadMoreEvents = action('onLoadMoreEvents');
  const logTerminate = action('onTerminate');
  const logBack = action('onBack');

  return (
    <RunScreen
      {...currentArgs}
      onSelectEvent={(eventId) => {
        logSelectEvent(eventId);
        updateArgs({ selectedEventId: eventId });
      }}
      onFollowingChange={(follow) => {
        logFollowingChange(follow);
        updateArgs({ isFollowing: follow });
      }}
      onEventFiltersChange={(filters) => {
        logEventFiltersChange(filters);
        updateArgs({ eventFilters: filters });
      }}
      onStatusFiltersChange={(filters) => {
        logStatusFiltersChange(filters);
        updateArgs({ statusFilters: filters });
      }}
      onTokensPopoverOpenChange={(open) => {
        logTokensPopoverOpenChange(open);
        updateArgs({ tokensPopoverOpen: open });
      }}
      onRunsPopoverOpenChange={(open) => {
        logRunsPopoverOpenChange(open);
        updateArgs({ runsPopoverOpen: open });
      }}
      onLoadMoreEvents={() => {
        logLoadMoreEvents();
      }}
      onTerminate={() => {
        logTerminate();
      }}
      onBack={() => {
        logBack();
      }}
      onClearSelection={() => {
        updateArgs({ selectedEventId: null });
      }}
    />
  );
};

export const Populated: Story = {
  args: {
    runId: SAMPLE_RUN_ID,
    status: 'running' as Status,
    createdAt: sampleRunSummary.createdAt,
    duration: '2m 45s',
    statistics: baseStatistics,
    tokens: baseTokens,
    events: sampleEvents,
    selectedEventId: defaultSelectedEventId,
    isFollowing: true,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: true,
    isLoadingMoreEvents: false,
    isLoading: false,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler, runSummaryHandler, runEventsHandler],
    },
  },
};

export const Empty: Story = {
  args: {
    runId: 'run-002',
    status: 'finished' as Status,
    createdAt: new Date().toISOString(),
    duration: '0s',
    statistics: {
      totalEvents: 0,
      messages: 0,
      llm: 0,
      tools: 0,
      summaries: 0,
    },
    tokens: { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 },
    events: [],
    selectedEventId: null,
    isFollowing: false,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: false,
    isLoadingMoreEvents: false,
    isLoading: false,
    isEmpty: true,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler, runSummaryHandler, runEventsHandler],
    },
  },
};

export const Loading: Story = {
  args: {
    runId: SAMPLE_RUN_ID,
    status: 'running' as Status,
    createdAt: new Date().toISOString(),
    duration: '—',
    statistics: baseStatistics,
    tokens: baseTokens,
    events: sampleEvents,
    selectedEventId: defaultSelectedEventId,
    isFollowing: true,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: true,
    isLoadingMoreEvents: true,
    isLoading: true,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler, runSummaryHandler, runEventsHandler],
    },
  },
};

export const Error: Story = {
  args: {
    runId: SAMPLE_RUN_ID,
    status: 'failed' as Status,
    createdAt: new Date().toISOString(),
    duration: '1m 12s',
    statistics: baseStatistics,
    tokens: baseTokens,
    events: sampleEvents,
    selectedEventId: defaultSelectedEventId,
    isFollowing: false,
    eventFilters: [],
    statusFilters: [],
    tokensPopoverOpen: false,
    runsPopoverOpen: false,
    hasMoreEvents: false,
    isLoadingMoreEvents: false,
    isLoading: false,
    isEmpty: false,
    error: 'Unable to load this run. Please retry.',
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
    msw: {
      handlers: [contextItemsHandler, runSummaryHandler, runEventsHandler],
    },
  },
};
