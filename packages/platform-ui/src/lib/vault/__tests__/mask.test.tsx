import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider, SecretsScreen } from '@agyn/ui-new';

describe('SecretsScreen masking', () => {
  it('unmasks only the targeted secret row', async () => {
    render(
      <TooltipProvider>
        <SecretsScreen
          secrets={[
            { id: 'a', key: 'secret/a', value: 'value-a', status: 'used' },
            { id: 'b', key: 'secret/b', value: 'value-b', status: 'used' },
          ]}
          renderSidebar={false}
        />
      </TooltipProvider>,
    );

    await screen.findByText('secret/a');
    const toggles = screen.getAllByRole('button', { name: /Unmask secret value/ });
    fireEvent.click(toggles[0]);

    expect(await screen.findByText('value-a')).toBeInTheDocument();
    expect(screen.queryByText('value-b')).not.toBeInTheDocument();

    fireEvent.click(toggles[1]);
    expect(await screen.findByText('value-b')).toBeInTheDocument();
  });
});
