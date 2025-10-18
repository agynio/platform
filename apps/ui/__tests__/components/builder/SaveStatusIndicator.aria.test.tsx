import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaveStatusIndicator, type SaveState } from '../../../src/builder/SaveStatusIndicator';
import { TooltipProvider } from '@hautech/ui';

describe('SaveStatusIndicator aria-label and colors', () => {
  const cases: Array<{ state: SaveState; label: string; color: string }> = [
    { state: 'idle', label: 'All changes saved', color: 'text-emerald-600' },
    { state: 'saved', label: 'Saved', color: 'text-emerald-600' },
    { state: 'saving', label: 'Saving…', color: 'text-yellow-600' },
    { state: 'error', label: 'Save failed', color: 'text-red-600' },
    { state: 'conflict', label: 'Edit conflict', color: 'text-red-600' },
  ];

  for (const c of cases) {
    it(`renders ${c.state} with aria-label and color`, async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <SaveStatusIndicator state={c.state} />
        </TooltipProvider>
      );
      const el = await screen.findByTestId('save-status');
      expect(el).toHaveAttribute('aria-label', c.label);
      expect(el.className).toContain(c.color);
    });
  }
});
