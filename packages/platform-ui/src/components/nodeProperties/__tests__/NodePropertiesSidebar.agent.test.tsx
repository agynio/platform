import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodeState } from '../types';

describe('NodePropertiesSidebar - agent', () => {
  it('renders profile inputs and applies default title fallback', () => {
    const onConfigChange = vi.fn();
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: 'Casey Quinn',
      role: 'Lead Planner',
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant.',
      restrictOutput: false,
      restrictionMessage: 'Use at least one tool before finishing.',
      restrictionMaxInjections: 0,
      queue: { debounceMs: 1000, whenBusy: 'wait', processBuffer: 'allTogether' },
      summarization: { keepTokens: 200, maxTokens: 600, prompt: 'Summaries go here.' },
    } as NodeConfig;

    const state: NodeState = { status: 'ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    const expectedPlaceholder = 'Casey Quinn (Lead Planner)';
    const titleInput = screen.getByPlaceholderText(expectedPlaceholder) as HTMLInputElement;
    expect(titleInput.value).toBe('');
    expect(screen.getByText(expectedPlaceholder)).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('e.g., Casey Quinn') as HTMLInputElement;
    expect(nameInput.value).toBe('Casey Quinn');
    fireEvent.change(nameInput, { target: { value: '  Delta  ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Delta' }));

    const roleInput = screen.getByPlaceholderText('e.g., Incident Commander') as HTMLInputElement;
    expect(roleInput.value).toBe('Lead Planner');
    fireEvent.change(roleInput, { target: { value: '  Support  ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ role: 'Support' }));

    fireEvent.change(titleInput, { target: { value: '   ' } });
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Casey Quinn (Lead Planner)' }),
    );
  });
});
