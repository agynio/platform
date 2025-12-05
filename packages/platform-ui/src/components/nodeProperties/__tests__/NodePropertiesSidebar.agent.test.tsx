import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodeState } from '../types';
import { TooltipProvider } from '@/components/ui/tooltip';

describe('NodePropertiesSidebar - agent', () => {
  it('renders profile inputs and applies default title fallback', () => {
    const onConfigChange = vi.fn();
    const config: NodeConfig = {
      kind: 'Agent',
      title: 'Custom Dispatch',
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
      <TooltipProvider delayDuration={0}>
        <NodePropertiesSidebar
          config={config}
          state={state}
          onConfigChange={onConfigChange}
          onProvision={vi.fn()}
          onDeprovision={vi.fn()}
          canProvision={false}
          canDeprovision={true}
          isActionPending={false}
        />
      </TooltipProvider>,
    );

    const expectedPlaceholder = 'Casey Quinn (Lead Planner)';
    expect(screen.getByText(expectedPlaceholder)).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue('Custom Dispatch') as HTMLInputElement;
    expect(titleInput.placeholder).toBe(expectedPlaceholder);
    expect(titleInput.value).toBe('Custom Dispatch');
    expect(screen.queryByText('Custom Dispatch')).not.toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('e.g., Casey Quinn') as HTMLInputElement;
    expect(nameInput.value).toBe('Casey Quinn');
    fireEvent.change(nameInput, { target: { value: '  Delta  ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Delta' }));

    const roleInput = screen.getByPlaceholderText('e.g., Incident Commander') as HTMLInputElement;
    expect(roleInput.value).toBe('Lead Planner');
    fireEvent.change(roleInput, { target: { value: '  Support  ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ role: 'Support' }));

    fireEvent.change(titleInput, { target: { value: '   ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ title: '' }));
  });

  it('uses combined name and role placeholder when title empty', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: 'Casey Quinn',
      role: 'Lead Planner',
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <TooltipProvider delayDuration={0}>
        <NodePropertiesSidebar
          config={config}
          state={state}
          onConfigChange={vi.fn()}
          onProvision={vi.fn()}
          onDeprovision={vi.fn()}
          canProvision={false}
          canDeprovision={false}
          isActionPending={false}
        />
      </TooltipProvider>,
    );

    const titleInput = screen.getByPlaceholderText('Casey Quinn (Lead Planner)') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('uses name-only placeholder when role missing', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: 'Nova',
      role: undefined,
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <TooltipProvider delayDuration={0}>
        <NodePropertiesSidebar
          config={config}
          state={state}
          onConfigChange={vi.fn()}
          onProvision={vi.fn()}
          onDeprovision={vi.fn()}
          canProvision={false}
          canDeprovision={false}
          isActionPending={false}
        />
      </TooltipProvider>,
    );

    const titleInput = screen.getByPlaceholderText('Nova') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('uses role-only placeholder when name missing', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: undefined,
      role: 'Navigator',
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <TooltipProvider delayDuration={0}>
        <NodePropertiesSidebar
          config={config}
          state={state}
          onConfigChange={vi.fn()}
          onProvision={vi.fn()}
          onDeprovision={vi.fn()}
          canProvision={false}
          canDeprovision={false}
          isActionPending={false}
        />
      </TooltipProvider>,
    );

    const titleInput = screen.getByPlaceholderText('Navigator') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('falls back to Agent placeholder when profile empty', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: undefined,
      role: undefined,
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <TooltipProvider delayDuration={0}>
        <NodePropertiesSidebar
          config={config}
          state={state}
          onConfigChange={vi.fn()}
          onProvision={vi.fn()}
          onDeprovision={vi.fn()}
          canProvision={false}
          canDeprovision={false}
          isActionPending={false}
        />
      </TooltipProvider>,
    );

    const titleInput = screen.getByPlaceholderText('Agent') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });
});
