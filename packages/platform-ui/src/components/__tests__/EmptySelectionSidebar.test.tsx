import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import EmptySelectionSidebar, { type DraggableNodeItem } from '../EmptySelectionSidebar';

describe('EmptySelectionSidebar', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders provided node items', () => {
    const items: DraggableNodeItem[] = [
      {
        id: 'custom-node',
        kind: 'Agent',
        title: 'Custom Node',
        description: 'Configured from test',
      },
    ];

    render(<EmptySelectionSidebar nodeItems={items} />);

    expect(screen.getByText('Custom Node')).toBeInTheDocument();
    expect(screen.queryByText('No templates available.')).not.toBeInTheDocument();
  });

  it('does not render mock items when the sidebar mock flag is disabled', () => {
    vi.stubEnv('VITE_UI_MOCK_SIDEBAR', 'false');

    render(<EmptySelectionSidebar />);

    expect(screen.getByText('No templates available.')).toBeInTheDocument();
    expect(screen.queryByText('HTTP Trigger')).not.toBeInTheDocument();
  });

  it('renders mock items only when the dev flag is enabled', () => {
    vi.stubEnv('DEV', 'true');
    vi.stubEnv('VITE_UI_MOCK_SIDEBAR', 'true');

    render(<EmptySelectionSidebar />);

    expect(screen.getByText('HTTP Trigger')).toBeInTheDocument();
    expect(screen.queryByText('No templates available.')).not.toBeInTheDocument();
  });
});
