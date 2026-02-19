import { describe, it, expect, vi } from 'vitest';
import { createDockerEventsParser } from '../src/service/dockerEvents.parser';

describe('createDockerEventsParser', () => {
  it('emits events exactly once across chunk boundaries', () => {
    const events: Array<Record<string, unknown>> = [];
    const parser = createDockerEventsParser((event) => events.push(event));

    parser.handleChunk(Buffer.from('{"id":1,"status":"start"}\n{"id":2'));
    parser.handleChunk(Buffer.from(',"status":"die"}\n{"id":3,"status":"stop"}\n'));
    parser.handleChunk(Buffer.from('{"id":4,"status":"destroy"}\n'));

    expect(events).toHaveLength(4);
    expect(events.map((event) => event.status)).toEqual(['start', 'die', 'stop', 'destroy']);
  });

  it('flushes trailing payloads and reports invalid json via onError', () => {
    const events: Array<Record<string, unknown>> = [];
    const onError = vi.fn();
    const parser = createDockerEventsParser((event) => events.push(event), { onError });

    parser.handleChunk(Buffer.from('{"id":5,"status":"oom"}'));
    parser.flush();
    parser.handleChunk(Buffer.from('{"id":6,"status":"start"}\n{"id":7'));
    parser.flush();

    expect(events).toEqual([
      { id: 5, status: 'oom' },
      { id: 6, status: 'start' },
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
