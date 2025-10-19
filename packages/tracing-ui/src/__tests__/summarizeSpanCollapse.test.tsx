import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { flushPromises, mockRealtimeNoop } from './testUtils';
import { SpanDetails } from '../components/SpanDetails';
import type { SpanDoc } from '../types';

function spanWithContexts(oldMsgs: any[], newMsgs: any[]): SpanDoc {
  return {
    spanId: 's-coll',
    traceId: 't1',
    parentSpanId: undefined,
    label: 'summarize',
    status: 'ok',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    completed: true,
    lastUpdate: new Date().toISOString(),
    events: [],
    rev: 0,
    duration: 0,
    service: 'test',
  idempotencyKeys: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
    attributes: {
      kind: 'summarize',
      summary: 'short summary',
      oldContext: oldMsgs,
      newContext: newMsgs,
    },
  } as SpanDoc;
}

describe('SummarizeIO collapse', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });
  it('shows collapse button when AI present in old and new context', async () => {
    mockRealtimeNoop();
    const span = spanWithContexts([
      { role: 'human', content: 'h1' },
      { role: 'ai', content: 'a1' },
      { role: 'human', content: 'tail1' },
    ], [
      { role: 'human', content: 'h2' },
      { role: 'ai', content: 'a2' },
      { role: 'human', content: 'tail2' },
    ]);

    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);

    // Two collapse buttons (one per context view)
    const buttons = screen.getAllByText(/Show previous/);
    expect(buttons.length).toBe(2);
    await waitFor(async () => expect(flushPromises()).resolves.toBeUndefined());
    await act(async () => {});
  });
});
