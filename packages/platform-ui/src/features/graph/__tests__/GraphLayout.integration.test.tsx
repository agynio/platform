import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const graphScreenSpy = vi.hoisted(() => vi.fn());

vi.mock('@/components/screens/GraphScreen', () => ({
  __esModule: true,
  default: (props: unknown) => {
    graphScreenSpy(props);
    return <div data-testid="graph-screen-mock" />;
  },
}));

import { GraphLayout } from '@/components/agents/GraphLayout';
import type { GraphNodeConfig } from '@/features/graph/types';

describe('GraphLayout', () => {
  it('passes props through to GraphScreen without side effects', () => {
    const nodes: GraphNodeConfig[] = [
      {
        id: 'node-1',
        template: 'sampleAgent',
        kind: 'Agent',
        title: 'Agent Node',
        x: 10,
        y: 20,
        status: 'ready',
        config: { title: 'Agent Node' },
        state: {},
        runtime: { provisionStatus: { state: 'ready' }, isPaused: false },
        capabilities: { provisionable: true },
        ports: {
          inputs: [{ id: 'node-1-in', title: 'IN' }],
          outputs: [{ id: 'node-1-out', title: 'OUT' }],
        },
      },
    ];
    const onBack = vi.fn();
    const onNodeUpdate = vi.fn();

    render(
      <GraphLayout
        nodes={nodes}
        savingStatus="saved"
        savingErrorMessage="All good"
        onBack={onBack}
        onNodeUpdate={onNodeUpdate}
      />, 
    );

    expect(graphScreenSpy).toHaveBeenCalledTimes(1);
    expect(graphScreenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes,
        savingStatus: 'saved',
        savingErrorMessage: 'All good',
        onBack,
        onNodeUpdate,
      }),
    );
  });
});
