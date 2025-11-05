import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders } from './integration/testUtils';

describe('AgentsThreads layout', () => {
  it('uses non-scrollable outer container with inner scrollable panels', async () => {
    render(
      <TestProviders>
        <AgentsThreads />
      </TestProviders>
    );
    // Outer container
    const outer = screen.getByRole('heading', { name: /Agents \/ Threads/i }).closest('div')?.parentElement;
    expect(outer).toBeTruthy();
    const outerClass = outer?.getAttribute('class') || '';
    expect(outerClass).toContain('absolute');
    expect(outerClass).toContain('inset-0');
    expect(outerClass).toContain('overflow-hidden');

    // Panels exist in DOM (responsive layout uses a single instance per panel)
    expect(screen.getByTestId('mobile-panel')).toBeInTheDocument();
    expect(screen.getByTestId('threads-panel')).toBeInTheDocument();
    expect(screen.getByTestId('messages-panel')).toBeInTheDocument();
  });
});
