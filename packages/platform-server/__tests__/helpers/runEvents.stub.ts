import { vi } from 'vitest';

type EventLike = { id: string };

function makeEvent(): EventLike {
  return { id: `evt-${Math.random().toString(36).slice(2, 10)}` };
}

export function createRunEventsStub() {
  return {
    recordInvocationMessage: vi.fn(async () => makeEvent()),
    recordInjection: vi.fn(async () => makeEvent()),
    startLLMCall: vi.fn(async () => makeEvent()),
    completeLLMCall: vi.fn(async () => {}),
    startToolExecution: vi.fn(async () => makeEvent()),
    completeToolExecution: vi.fn(async () => {}),
    recordSummarization: vi.fn(async () => makeEvent()),
  } as const;
}
