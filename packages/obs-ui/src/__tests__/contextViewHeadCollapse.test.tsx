import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextView } from '../components/ContextView';

function msgs() {
  return [
    { role: 'system', content: 's' },
    { role: 'human', content: 'h1' },
    { role: 'ai', content: 'answer1' },
    { role: 'human', content: 'follow' },
    { role: 'tool', content: 'tool data' },
    { role: 'ai', content: 'final answer' },
  ];
}

describe('ContextView head collapse', () => {
  it('collapses when last AI final and strategy head', () => {
    render(<ContextView messages={msgs()} title="Ctx" />);
    // Should render the collapse button; rely on role button and partial accessible name only if necessary
    const btns = screen.getAllByRole('button');
    expect(btns.some(b => /Show previous/.test(b.textContent || ''))).toBe(true);
  });
});
