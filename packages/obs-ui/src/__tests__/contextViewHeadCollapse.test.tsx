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
    // Should show button 'Show earlier'
    expect(screen.getByText(/Show earlier/)).toBeTruthy();
  });
});
