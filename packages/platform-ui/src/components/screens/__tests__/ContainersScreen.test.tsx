import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContainersScreen, { type ContainerStatus } from '../ContainersScreen';

const EMPTY_COUNTS: Record<ContainerStatus | 'all', number> = {
  running: 0,
  stopped: 0,
  starting: 0,
  stopping: 0,
  all: 0,
};

describe('ContainersScreen', () => {
  it('shows layout with header and tabs when no containers are available', () => {
    render(
      <ContainersScreen
        containers={[]}
        statusFilter="running"
        counts={EMPTY_COUNTS}
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Containers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Running (0)' })).toBeInTheDocument();
    expect(screen.getByText('No containers found')).toBeInTheDocument();
  });
});
