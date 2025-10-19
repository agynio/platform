import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContextView from '../components/ContextView';

describe('ContextView overflow wrapping', () => {
  it('applies obs-md class to markdown renderer', () => {
    render(<ContextView title="Ctx" messages={[{ role: 'human', content: 'hello' }]} />);
    const md = screen.getByText('hello').closest('.obs-md');
    expect(md).toBeTruthy();
  });
});

