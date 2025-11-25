import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import NodePropertiesSidebar, {
  type NodeConfig,
  type NodeState,
} from '../NodePropertiesSidebar';

const baseConfig: NodeConfig = {
  kind: 'Agent',
  title: 'Agent One',
};

const baseState: NodeState = {
  status: 'not_ready',
};

describe('NodePropertiesSidebar', () => {
  it('renders the node status badge using provided state', () => {
    render(<NodePropertiesSidebar config={baseConfig} state={baseState} />);

    expect(screen.getByText('Not Ready')).toBeInTheDocument();
  });

  it('bubbles config updates through onConfigChange when the title changes', () => {
    const handleConfigChange = vi.fn();

    render(
      <NodePropertiesSidebar
        config={baseConfig}
        state={baseState}
        onConfigChange={handleConfigChange}
      />,
    );

    const input = screen.getByDisplayValue('Agent One');
    fireEvent.change(input, { target: { value: 'Updated title' } });

    expect(handleConfigChange).toHaveBeenCalledWith({ title: 'Updated title' });
  });
});
