import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReactFlowProvider } from '@xyflow/react';

import GraphNode from '../Node';

describe('components/Node', () => {
  it('renders error icon and shows detail tooltip when provisioning fails', async () => {
    const user = userEvent.setup();
    render(
      <ReactFlowProvider>
        <GraphNode
          kind="Agent"
          title="Agent Node"
          status="provisioning_error"
          errorDetail="Provisioning failed due to timeout"
          inputs={[{ id: 'input', title: 'input' }]}
          outputs={[{ id: 'output', title: 'output' }]}
        />
      </ReactFlowProvider>,
    );

    const errorButton = screen.getByRole('button', { name: /view node error details/i });
    await user.hover(errorButton);

    const messages = await screen.findAllByText('Provisioning failed due to timeout');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('falls back to generic tooltip text when detail is missing', async () => {
    const user = userEvent.setup();
    render(
      <ReactFlowProvider>
        <GraphNode
          kind="Agent"
          title="Agent Node"
          status="provisioning_error"
          inputs={[{ id: 'input', title: 'input' }]}
          outputs={[{ id: 'output', title: 'output' }]}
        />
      </ReactFlowProvider>,
    );

    const errorButton = screen.getByRole('button', { name: /view node error details/i });
    await user.hover(errorButton);

    const fallbackMessages = await screen.findAllByText(/No additional error details available/i);
    expect(fallbackMessages.length).toBeGreaterThan(0);
  });
});
