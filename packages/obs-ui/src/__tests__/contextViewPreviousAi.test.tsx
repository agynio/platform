import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextView } from '../components/ContextView';

// Messages where last AI is final message, but there is an earlier AI
const messages = [
  { role: 'system', content: 's' },
  { role: 'human', content: 'h1' },
  { role: 'ai', content: 'first answer' },
  { role: 'tool', content: 'tool data' },
  { role: 'ai', content: 'final answer' }, // final AI at end
];

describe('ContextView previous AI pivot', () => {
  it('uses previous AI as pivot and shows Show previous button with correct hidden count', () => {
    render(<ContextView messages={messages} title="Ctx" />);
    // pivot should be the first ai (index 2), so hidden count = pivot+1 = 3
    expect(screen.getByText(/Show previous \(3 hidden\)/)).toBeTruthy();
  });
});
