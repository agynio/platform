import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpanDetails } from '../components/SpanDetails';
import type { SpanDoc } from '../types';

function makeSpan(attrs: Record<string, unknown>): SpanDoc {
  const now = new Date().toISOString();
  return {
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
  } as any;
}

describe('IO modes', () => {
  function getLatestLabeled<T extends HTMLElement = HTMLElement>(label: string): T {
    const nodes = screen.getAllByLabelText(label) as T[];
    return nodes[nodes.length - 1];
  }
  it('renders input mode selector (JSON/YAML) and output mode selector', () => {
    const span = makeSpan({ kind: 'tool_call', input: { a: 1 } });
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    // IO tab is active by default for tool span; look for selectors
    expect(screen.getByText('Input:')).toBeTruthy();
    expect(screen.getByText('Output:')).toBeTruthy();

    const inputSelect = screen.getByLabelText('Input:') as HTMLSelectElement;
    const outputSelect = screen.getByLabelText('Output:') as HTMLSelectElement;
    expect(inputSelect.value).toBe('json');
    expect(outputSelect.value).toBe('md');

    // Switch modes
    fireEvent.change(inputSelect, { target: { value: 'yaml' } });
    expect(inputSelect.value).toBe('yaml');
    fireEvent.change(outputSelect, { target: { value: 'json' } });
    expect(outputSelect.value).toBe('json');
  });

  it('resets modes on span change', () => {
    const now = new Date().toISOString();
    const s1 = makeSpan({ kind: 'tool_call', input: { a: 1 } });
    const s2: SpanDoc = { ...s1, spanId: 's2', attributes: { kind: 'tool_call', input: { b: 2 } } } as any;

    const { rerender } = render(<SpanDetails span={s1} spans={[s1]} onSelectSpan={() => {}} onClose={() => {}} />);

    // Scope queries to their regions to avoid duplicate matches across renders
    const inputSelect = getLatestLabeled('Input:') as HTMLSelectElement;
    const outputSelect = getLatestLabeled('Output:') as HTMLSelectElement;
    fireEvent.change(inputSelect, { target: { value: 'yaml' } });
    fireEvent.change(outputSelect, { target: { value: 'json' } });
    expect(inputSelect.value).toBe('yaml');
    expect(outputSelect.value).toBe('json');

    rerender(<SpanDetails span={s2} spans={[s2]} onSelectSpan={() => {}} onClose={() => {}} />);
    // Should reset to defaults
    expect((getLatestLabeled('Input:') as HTMLSelectElement).value).toBe('json');
    expect((getLatestLabeled('Output:') as HTMLSelectElement).value).toBe('md');
  });

  it('shows warning when switching output to JSON for non-JSON string', () => {
    const span = makeSpan({ kind: 'tool_call', output: { content: 'not json' } });
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    const outputSelect = getLatestLabeled('Output:') as HTMLSelectElement;
    // switch to JSON mode
    fireEvent.change(outputSelect, { target: { value: 'json' } });
    // warning should appear
    expect(screen.getByText(/Not valid JSON; showing raw string/i)).toBeTruthy();
  });

  it('shows warning for tool input JSON mode when input is a non-JSON string', () => {
    const span = makeSpan({ kind: 'tool_call', input: 'not json' });
    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);
    // Input defaults to JSON mode (warning may render more than once due to async editor mounts)
    expect(screen.getAllByText(/Not valid JSON; showing raw string/i).length).toBeGreaterThan(0);
  });
});
