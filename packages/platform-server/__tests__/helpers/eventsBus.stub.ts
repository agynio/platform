import { vi } from 'vitest';

export type EventsBusStub = {
  publishEvent: ReturnType<typeof vi.fn>;
  emitNodeState: ReturnType<typeof vi.fn>;
  emitThreadCreated: ReturnType<typeof vi.fn>;
  emitThreadUpdated: ReturnType<typeof vi.fn>;
  emitMessageCreated: ReturnType<typeof vi.fn>;
  emitRunStatusChanged: ReturnType<typeof vi.fn>;
  emitThreadMetrics: ReturnType<typeof vi.fn>;
  emitThreadMetricsAncestors: ReturnType<typeof vi.fn>;
  emitAgentQueueEnqueued: ReturnType<typeof vi.fn>;
  emitAgentQueueDrained: ReturnType<typeof vi.fn>;
  emitReminderCount: ReturnType<typeof vi.fn>;
  emitToolOutputChunk: ReturnType<typeof vi.fn>;
  emitToolOutputTerminal: ReturnType<typeof vi.fn>;
  subscribeToRunEvents: ReturnType<typeof vi.fn>;
  subscribeToToolOutputChunk: ReturnType<typeof vi.fn>;
  subscribeToToolOutputTerminal: ReturnType<typeof vi.fn>;
  subscribeToReminderCount: ReturnType<typeof vi.fn>;
  subscribeToNodeState: ReturnType<typeof vi.fn>;
  subscribeToThreadCreated: ReturnType<typeof vi.fn>;
  subscribeToThreadUpdated: ReturnType<typeof vi.fn>;
  subscribeToMessageCreated: ReturnType<typeof vi.fn>;
  subscribeToRunStatusChanged: ReturnType<typeof vi.fn>;
  subscribeToThreadMetrics: ReturnType<typeof vi.fn>;
  subscribeToThreadMetricsAncestors: ReturnType<typeof vi.fn>;
  subscribeToAgentQueueEnqueued: ReturnType<typeof vi.fn>;
  subscribeToAgentQueueDrained: ReturnType<typeof vi.fn>;
};

export function createEventsBusStub(): EventsBusStub {
  const disposer = () => vi.fn();
  return {
    publishEvent: vi.fn(async () => null),
    emitNodeState: vi.fn(),
    emitThreadCreated: vi.fn(),
    emitThreadUpdated: vi.fn(),
    emitMessageCreated: vi.fn(),
    emitRunStatusChanged: vi.fn(),
    emitThreadMetrics: vi.fn(),
    emitThreadMetricsAncestors: vi.fn(),
    emitAgentQueueEnqueued: vi.fn(),
    emitAgentQueueDrained: vi.fn(),
    emitReminderCount: vi.fn(),
    emitToolOutputChunk: vi.fn(),
    emitToolOutputTerminal: vi.fn(),
    subscribeToRunEvents: vi.fn(() => disposer()),
    subscribeToToolOutputChunk: vi.fn(() => disposer()),
    subscribeToToolOutputTerminal: vi.fn(() => disposer()),
    subscribeToReminderCount: vi.fn(() => disposer()),
    subscribeToNodeState: vi.fn(() => disposer()),
    subscribeToThreadCreated: vi.fn(() => disposer()),
    subscribeToThreadUpdated: vi.fn(() => disposer()),
    subscribeToMessageCreated: vi.fn(() => disposer()),
    subscribeToRunStatusChanged: vi.fn(() => disposer()),
    subscribeToThreadMetrics: vi.fn(() => disposer()),
    subscribeToThreadMetricsAncestors: vi.fn(() => disposer()),
    subscribeToAgentQueueEnqueued: vi.fn(() => disposer()),
    subscribeToAgentQueueDrained: vi.fn(() => disposer()),
  };
}
