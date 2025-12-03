import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import EmptySelectionSidebar from '../EmptySelectionSidebar';

describe('EmptySelectionSidebar production gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides mock node items when not in dev mode, even if mock flag enabled', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.stubEnv('DEV', 'false');
    vi.stubEnv('VITE_UI_MOCK_SIDEBAR', 'true');

    try {
      render(<EmptySelectionSidebar />);

      expect(screen.getByText('No templates available.')).toBeInTheDocument();
      expect(screen.queryByText('HTTP Trigger')).not.toBeInTheDocument();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
