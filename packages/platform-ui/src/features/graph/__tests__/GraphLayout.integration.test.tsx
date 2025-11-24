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

describe('GraphLayout', () => {
  it('passes props through to GraphScreen without side effects', () => {
    const nodes = [
      {
        id: 'node-1',
        kind: 'Agent' as const,
        title: 'Agent Node',
        x: 10,
        y: 20,
        status: 'ready' as const,
        data: {},
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
