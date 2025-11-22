import { vi } from 'vitest';

type EventLike = { id: string };

function makeEvent(): EventLike {
  return { id: `evt-${Math.random().toString(36).slice(2, 10)}` };
}

export function createRunEventsStub() {
  const contextItems: Array<{ id: string }> = [];

  const createContextItems = vi.fn(async (items: Array<{ id?: string }> = []) => {
    const created: string[] = [];
    for (const item of items) {
      const id = item?.id ?? `ctx-${contextItems.length + created.length + 1}`;
      contextItems.push({ id });
      created.push(id);
    }
    return created;
  });

  const startLLMCall = vi.fn(async (args?: { contextItemIds?: string[]; contextItems?: Array<{ id?: string }> }) => {
    const event = {
      ...makeEvent(),
      contextItemIds: [...(args?.contextItemIds ?? [])],
    } as EventLike & { contextItemIds: string[] };

    if (args?.contextItems?.length) {
      const created = await createContextItems(args.contextItems);
      event.contextItemIds.push(...created);
    }

    return event;
  });

  return {
    recordInvocationMessage: vi.fn(async () => makeEvent()),
    recordInjection: vi.fn(async () => makeEvent()),
    startLLMCall,
    completeLLMCall: vi.fn(async () => {}),
    startToolExecution: vi.fn(async () => makeEvent()),
    completeToolExecution: vi.fn(async () => {}),
    recordSummarization: vi.fn(async () => makeEvent()),
    publishEvent: vi.fn(async () => null),
    createContextItems,
  } as const;
}

export function createEventsBusStub() {
  return {
    publishEvent: vi.fn(async () => null),
    subscribeToRunEvents: vi.fn(() => vi.fn()),
    subscribeToToolOutputChunk: vi.fn(() => vi.fn()),
    subscribeToToolOutputTerminal: vi.fn(() => vi.fn()),
    emitToolOutputChunk: vi.fn(),
    emitToolOutputTerminal: vi.fn(),
  } as const;
}
