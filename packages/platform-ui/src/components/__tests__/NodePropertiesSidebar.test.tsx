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

  it('emits agent configuration updates for model, restriction, and summarization', () => {
    const handleConfigChange = vi.fn();

    render(
      <NodePropertiesSidebar
        config={{ ...baseConfig, model: 'gpt-4', summarization: {} }}
        state={baseState}
        onConfigChange={handleConfigChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('gpt-4'), {
      target: { value: 'claude-3-opus' },
    });

    expect(handleConfigChange).toHaveBeenCalledWith({ model: 'claude-3-opus' });

    handleConfigChange.mockClear();

    const restrictionToggle = screen.getByRole('switch');
    fireEvent.click(restrictionToggle);

    expect(handleConfigChange).toHaveBeenCalledWith({ restrictOutput: true });

    handleConfigChange.mockClear();

    fireEvent.change(screen.getByPlaceholderText('Summarize the conversation above...'), {
      target: { value: 'Summaries should keep critical context.' },
    });

    expect(handleConfigChange).toHaveBeenCalledWith({
      summarization: { prompt: 'Summaries should keep critical context.' },
      summarizationPrompt: 'Summaries should keep critical context.',
    });
  });

  it('emits MCP updates and toggles tools', () => {
    const handleConfigChange = vi.fn();
    const handleToggleTool = vi.fn();

    render(
      <NodePropertiesSidebar
        config={{
          kind: 'MCP',
          title: 'MCP Node',
          namespace: 'initial-namespace',
          command: 'run-command',
          env: [],
        }}
        state={{ status: 'ready' }}
        onConfigChange={handleConfigChange}
        tools={[{ name: 'search', title: 'Search Tool', description: 'searches resources' }]}
        enabledTools={['search']}
        onToggleTool={handleToggleTool}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('my-mcp-server'), {
      target: { value: 'utility-server' },
    });

    expect(handleConfigChange).toHaveBeenCalledWith({ namespace: 'utility-server' });

    handleConfigChange.mockClear();

    fireEvent.click(screen.getByText('Limits'));

    fireEvent.change(screen.getByPlaceholderText('60000'), {
      target: { value: '120000' },
    });

    expect(handleConfigChange).toHaveBeenCalledWith({ requestTimeoutMs: 120000 });

    handleConfigChange.mockClear();

    const toolToggle = screen.getByRole('switch');
    fireEvent.click(toolToggle);

    expect(handleToggleTool).toHaveBeenCalledWith('search', false);
  });

  it('emits workspace updates for container, toggles, ttl, and nix packages', () => {
    const handleConfigChange = vi.fn();

    render(
      <NodePropertiesSidebar
        config={{
          kind: 'Workspace',
          title: 'Workspace Node',
          image: 'ubuntu:latest',
          platform: 'auto',
          initialScript: '',
          enableDinD: false,
          ttlSeconds: 3600,
          volumes: { enabled: true, mountPath: '/mnt/data' },
          nix: { packages: [{ name: 'nodejs', version: 'latest' }] },
          env: [],
        }}
        state={baseState}
        onConfigChange={handleConfigChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('docker.io/library/ubuntu:latest'), {
      target: { value: 'docker.io/library/node:20' },
    });

    expect(handleConfigChange).toHaveBeenCalledWith({ image: 'docker.io/library/node:20' });

    handleConfigChange.mockClear();

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);

    expect(handleConfigChange).toHaveBeenCalledWith({ enableDinD: true });

    handleConfigChange.mockClear();

    fireEvent.click(switches[1]);

    expect(handleConfigChange).toHaveBeenCalledWith({
      volumes: { enabled: false, mountPath: '/mnt/data' },
    });

    handleConfigChange.mockClear();

    fireEvent.change(screen.getByPlaceholderText('3600'), {
      target: { value: '5400' },
    });

    expect(handleConfigChange).toHaveBeenCalledWith({ ttlSeconds: 5400 });
  });
});
