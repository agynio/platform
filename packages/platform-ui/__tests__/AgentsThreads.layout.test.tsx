import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders } from './integration/testUtils';
import { MemoryRouter } from 'react-router-dom';

describe('AgentsThreads layout', () => {
  it('renders header, threads list, and conversation panels', async () => {
    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    expect(await screen.findByTestId('threads-list')).toBeInTheDocument();
    expect(screen.getByText('Select a thread to view details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Closed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All/i })).toBeInTheDocument();
    expect(screen.getByTitle('New thread')).toBeInTheDocument();
  });
});
