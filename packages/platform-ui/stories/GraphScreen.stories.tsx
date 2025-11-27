import type { Meta, StoryObj } from '@storybook/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import GraphScreen from '../src/components/screens/GraphScreen';
import { withMainLayout } from './decorators/withMainLayout';
import type { GraphNodeConfig } from '../src/components/screens/GraphScreen';
import type { SavingStatus } from '../src/components/SavingStatusControl';

const meta: Meta<typeof GraphScreen> = {
  title: 'Screens/Graph',
  component: GraphScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof GraphScreen>;

export const Default: Story = {
  args: {
    nodes: [
      { id: 'node-1', kind: 'Trigger', title: 'HTTP Trigger', x: 0, y: 0, status: 'ready', data: { method: 'POST' } },
      { id: 'node-2', kind: 'Agent', title: 'GPT-4 Agent', x: 320, y: 0, status: 'ready', data: { model: 'gpt-4', temperature: 0.7 }, avatarSeed: 'GPT4Agent' },
      { id: 'node-3', kind: 'Tool', title: 'Search Tool', x: 640, y: 0, status: 'ready', data: { toolName: 'web_search' } },
      { id: 'node-4', kind: 'MCP', title: 'Database MCP', x: 0, y: 220, status: 'ready', data: { server: 'postgres' } },
      { id: 'node-5', kind: 'Workspace', title: 'Dev Workspace', x: 320, y: 220, status: 'provisioning', data: { cpu: 2, memory: 4096 } },
      { id: 'node-6', kind: 'Agent', title: 'Claude Agent', x: 640, y: 220, status: 'not_ready', data: { model: 'claude-3' }, avatarSeed: 'ClaudeAgent' },
    ],
  },
  parameters: {
    selectedMenuItem: 'graph',
  },
};

export const Saving: Story = {
  args: {
    nodes: [
      { id: 'node-1', kind: 'Trigger', title: 'HTTP Trigger', x: 0, y: 0, status: 'ready', data: { method: 'POST' } },
      { id: 'node-2', kind: 'Agent', title: 'GPT-4 Agent', x: 320, y: 0, status: 'ready', data: { model: 'gpt-4', temperature: 0.7 }, avatarSeed: 'GPT4Agent' },
      { id: 'node-3', kind: 'Tool', title: 'Search Tool', x: 640, y: 0, status: 'ready', data: { toolName: 'web_search' } },
      { id: 'node-4', kind: 'MCP', title: 'Database MCP', x: 0, y: 220, status: 'ready', data: { server: 'postgres' } },
      { id: 'node-5', kind: 'Workspace', title: 'Dev Workspace', x: 320, y: 220, status: 'provisioning', data: { cpu: 2, memory: 4096 } },
      { id: 'node-6', kind: 'Agent', title: 'Claude Agent', x: 640, y: 220, status: 'not_ready', data: { model: 'claude-3' }, avatarSeed: 'ClaudeAgent' },
    ],
    savingStatus: 'saving',
  },
};

export const SaveError: Story = {
  args: {
    nodes: [
      { id: 'node-1', kind: 'Trigger', title: 'HTTP Trigger', x: 0, y: 0, status: 'ready', data: { method: 'POST' } },
      { id: 'node-2', kind: 'Agent', title: 'GPT-4 Agent', x: 320, y: 0, status: 'ready', data: { model: 'gpt-4', temperature: 0.7 }, avatarSeed: 'GPT4Agent' },
      { id: 'node-3', kind: 'Tool', title: 'Search Tool', x: 640, y: 0, status: 'ready', data: { toolName: 'web_search' } },
      { id: 'node-4', kind: 'MCP', title: 'Database MCP', x: 0, y: 220, status: 'ready', data: { server: 'postgres' } },
      { id: 'node-5', kind: 'Workspace', title: 'Dev Workspace', x: 320, y: 220, status: 'provisioning', data: { cpu: 2, memory: 4096 } },
      { id: 'node-6', kind: 'Agent', title: 'Claude Agent', x: 640, y: 220, status: 'not_ready', data: { model: 'claude-3' }, avatarSeed: 'ClaudeAgent' },
    ],
    savingStatus: 'error',
    savingErrorMessage: 'Connection to server lost',
  },
};

export const Interactive: Story = {
  render: () => {
    const [nodes, setNodes] = useState<GraphNodeConfig[]>([
      { id: 'node-1', kind: 'Trigger', title: 'HTTP Trigger', x: 0, y: 0, status: 'ready', data: { method: 'POST' } },
      { id: 'node-2', kind: 'Agent', title: 'GPT-4 Agent', x: 320, y: 0, status: 'ready', data: { model: 'gpt-4', temperature: 0.7 }, avatarSeed: 'GPT4Agent' },
      { id: 'node-3', kind: 'Tool', title: 'Search Tool', x: 640, y: 0, status: 'ready', data: { toolName: 'web_search' } },
      { id: 'node-4', kind: 'MCP', title: 'Database MCP', x: 0, y: 220, status: 'ready', data: { server: 'postgres' } },
      { id: 'node-5', kind: 'Workspace', title: 'Dev Workspace', x: 320, y: 220, status: 'provisioning', data: { cpu: 2, memory: 4096 } },
      { id: 'node-6', kind: 'Agent', title: 'Claude Agent', x: 640, y: 220, status: 'not_ready', data: { model: 'claude-3' }, avatarSeed: 'ClaudeAgent' },
    ]);
    const [savingStatus, setSavingStatus] = useState<SavingStatus>('saved');
    const saveTimeoutRef = useRef<NodeJS.Timeout>();

    const handleNodeUpdate = useCallback((nodeId: string, updates: Partial<GraphNodeConfig>) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) =>
          node.id === nodeId ? { ...node, ...updates } : node
        )
      );

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set saving status
      setSavingStatus('saving');

      // Simulate debounced save
      saveTimeoutRef.current = setTimeout(() => {
        setSavingStatus('saved');
      }, 500);
    }, []);

    useEffect(() => {
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }, []);

    return (
      <GraphScreen
        nodes={nodes}
        savingStatus={savingStatus}
        onNodeUpdate={handleNodeUpdate}
      />
    );
  },
};
