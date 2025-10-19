import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpanDetails } from '../components/SpanDetails';
import type { SpanDoc } from '../types';

function makeSpan(attrs: Record<string, unknown>): SpanDoc {
  const now = new Date().toISOString();
  const s: SpanDoc = {
    spanId: 's1',
    traceId: 't1',
    label: 'tool_call',
    status: 'ok',
    startTime: now,
    endTime: now,
    completed: true,
    lastUpdate: now,
    attributes: attrs,
    events: [],
    rev: 1,
    idempotencyKeys: [],
    createdAt: now,
    updatedAt: now,
  };
  return s;
}

describe('IO modes', () => {
  function getLatestByTestId<T extends HTMLElement = HTMLElement>(testId: string): T {
    const nodes = screen.getAllByTestId(testId) as T[];
    return nodes[nodes.length - 1];
  }
  // label-based helpers removed after selector UI change
  it('renders input mode selector (JSON/YAML) and output mode selector', () => {
    const span = makeSpan({ kind: 'tool_call', input: { a: 1 } });
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    // IO tab is active by default for tool span; look for selectors
    const inputSelect = getLatestByTestId('obsui-select-tool-input') as HTMLSelectElement;
    const outputSelect = getLatestByTestId('obsui-select-tool-output') as HTMLSelectElement;
    expect(inputSelect.value).toBe('json');
    expect(outputSelect.value).toBe('md');

    // Switch modes
    fireEvent.change(inputSelect, { target: { value: 'yaml' } });
    expect(inputSelect.value).toBe('yaml');
    fireEvent.change(outputSelect, { target: { value: 'json' } });
    expect(outputSelect.value).toBe('json');
  });

  it('persists modes across span changes', () => {
    const now = new Date().toISOString();
    const s1 = makeSpan({ kind: 'tool_call', input: { a: 1 } });
    const s2: SpanDoc = { ...s1, spanId: 's2', attributes: { kind: 'tool_call', input: { b: 2 } } } as any;

    const { rerender } = render(<SpanDetails span={s1} spans={[s1]} onSelectSpan={() => {}} onClose={() => {}} />);

    const inputSelect = getLatestByTestId('obsui-select-tool-input') as HTMLSelectElement;
    const outputSelect = getLatestByTestId('obsui-select-tool-output') as HTMLSelectElement;
    fireEvent.change(inputSelect, { target: { value: 'yaml' } });
    fireEvent.change(outputSelect, { target: { value: 'json' } });
    expect(inputSelect.value).toBe('yaml');
    expect(outputSelect.value).toBe('json');

    rerender(<SpanDetails span={s2} spans={[s2]} onSelectSpan={() => {}} onClose={() => {}} />);
    // Should persist previous selection for tool kind+label
    expect((getLatestByTestId('obsui-select-tool-input') as HTMLSelectElement).value).toBe('yaml');
    expect((getLatestByTestId('obsui-select-tool-output') as HTMLSelectElement).value).toBe('json');
  });

  it('shows warning when switching output to JSON for non-JSON string', () => {
    const span = makeSpan({ kind: 'tool_call', output: { content: 'not json' } });
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    const outputSelect = getLatestByTestId('obsui-select-tool-output') as HTMLSelectElement;
    // switch to JSON mode
    fireEvent.change(outputSelect, { target: { value: 'json' } });
    // warning should appear
    // There may be multiple warnings due to memoized re-renders; assert at least one
    const warnings = screen.getAllByText(/Not valid JSON; showing raw string/i);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('shows warning for tool input JSON mode when input is a non-JSON string', () => {
    const span = makeSpan({ kind: 'tool_call', input: 'not json' });
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    // Input defaults to JSON mode (warning may render more than once due to async editor mounts)
    expect(screen.getAllByText(/Not valid JSON; showing raw string/i).length).toBeGreaterThan(0);
  });
});

describe('IO modes (LLM spans)', () => {
  function makeLLMSpan(content: string, toolCalls: Array<{ id?: string; name?: string; arguments?: unknown }>): SpanDoc {
    const now = new Date().toISOString();
    const span: SpanDoc = {
      spanId: 'llm1',
      traceId: 't1',
      label: 'llm',
      status: 'ok',
      startTime: now,
      endTime: now,
      completed: true,
      lastUpdate: now,
      attributes: { kind: 'llm', output: { content, toolCalls } },
      events: [],
      rev: 1,
      idempotencyKeys: [],
      createdAt: now,
      updatedAt: now,
    };
    return span;
  }

  it('keeps LLM content selector independent from per-tool-call selector', () => {
    const span = makeLLMSpan('Hello world', [{ id: 'tc1', name: 'foo', arguments: { a: 1 } }]);
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    const contentSelect = screen.getByTestId('obsui-select-llm-content') as HTMLSelectElement;
    const toolSelect = screen.getByTestId('obsui-select-llm-toolcall-0') as HTMLSelectElement;
    expect(contentSelect.value).toBe('md');
    expect(toolSelect.value).toBe('json');
    // Change content mode
    fireEvent.change(contentSelect, { target: { value: 'yaml' } });
    expect(contentSelect.value).toBe('yaml');
    // Tool-call selector remains unchanged
    expect(toolSelect.value).toBe('json');
  });

  it('persists per-tool-call view mode by toolCall.id, independent of index', () => {
    const s1 = makeLLMSpan('text', [
      { id: 'A', name: 'foo', arguments: { a: 1 } },
      { id: 'B', name: 'foo', arguments: { b: 2 } },
    ]);
    const { rerender } = render(<SpanDetails span={s1} spans={[s1]} onSelectSpan={() => {}} onClose={() => {}} />);
    const selectIdx1 = screen.getByTestId('obsui-select-llm-toolcall-1') as HTMLSelectElement; // id B at index 1
    fireEvent.change(selectIdx1, { target: { value: 'terminal' } });
    expect(selectIdx1.value).toBe('terminal');

    const s2 = makeLLMSpan('text', [
      { id: 'B', name: 'foo', arguments: { b: 2 } },
      { id: 'A', name: 'foo', arguments: { a: 1 } },
    ]);
    rerender(<SpanDetails span={s2} spans={[s2]} onSelectSpan={() => {}} onClose={() => {}} />);
    // B moved to index 0; persisted mode should follow id
    const selectIdx0 = (screen.getAllByTestId('obsui-select-llm-toolcall-0') as HTMLSelectElement[]).at(-1)!;
    expect(selectIdx0.value).toBe('terminal');
  });

  it('shows warning on LLM content when switching to JSON and content is not JSON', () => {
    const span = makeLLMSpan('not json', []);
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    const contentSelect = (screen.getAllByTestId('obsui-select-llm-content') as HTMLSelectElement[]).at(-1)!;
    fireEvent.change(contentSelect, { target: { value: 'json' } });
    // multiple warnings can appear; use getAll
    expect(screen.getAllByText(/Not valid JSON; showing raw string/i).length).toBeGreaterThan(0);
  });
});
