import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpanDetails } from '../components/SpanDetails';
import type { SpanDoc } from '../types';

function baseSpan(partial: Partial<SpanDoc>): SpanDoc {
  return {
    spanId: 's1',
    traceId: 't1',
    parentSpanId: undefined,
    label: 'summarize',
    status: 'ok',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    attributes: {},
    ...partial,
  } as SpanDoc;
}

describe('Summarize span IO tab', () => {
  it('renders old context, summary markdown and new context', () => {
    const span = baseSpan({
      attributes: {
        kind: 'summarize',
        oldContext: [ { role: 'human', content: 'Hello **World**' } ],
        summary: 'A short **summary**',
        newContext: [ { role: 'system', content: 'Summary retained' } ],
      },
    });

    render(<SpanDetails span={span} spans={[span]} onSelectSpan={() => {}} onClose={() => {}} />);

    // IO tab active by default for summarize span
    expect(screen.getByText('Old Context')).toBeTruthy();
    expect(screen.getByText('New Context')).toBeTruthy();
    expect(screen.getAllByText(/summary/i).length).toBeGreaterThan(0);
    // markdown bold should render; just ensure content present
    expect(screen.getByText('World')).toBeTruthy();
  });
});
