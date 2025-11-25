import type { Meta, StoryObj } from '@storybook/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import GraphScreen from '../src/components/screens/GraphScreen';
import { withMainLayout } from './decorators/withMainLayout';
import type { GraphNodeConfig, GraphNodeUpdate } from '../src/features/graph/types';
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

const makePorts = (nodeId: string, kind: GraphNodeConfig['kind']): GraphNodeConfig['ports'] => {
  switch (kind) {
    case 'Trigger':
      return {
        inputs: [],
        outputs: [{ id: `${nodeId}-out`, title: 'OUT' }],
      };
    case 'Workspace':
      return {
        inputs: [
          { id: `${nodeId}-in-config`, title: 'CONFIG' },
          { id: `${nodeId}-in-artifacts`, title: 'ARTIFACTS' },
        ],
        outputs: [],
      };
    default:
      return {
        inputs: [{ id: `${nodeId}-in`, title: 'IN' }],
        outputs: [{ id: `${nodeId}-out`, title: 'OUT' }],
      };
  }
};

function createSampleNodes(): GraphNodeConfig[] {
  return [
    {
      id: 'node-1',
      template: 'httpTrigger',
      kind: 'Trigger',
      title: 'HTTP Trigger',
      x: 0,
      y: 0,
      status: 'ready',
      config: { title: 'HTTP Trigger', method: 'POST' },
      state: {},
      runtime: { provisionStatus: { state: 'ready' }, isPaused: false },
      capabilities: { provisionable: false },
      ports: makePorts('node-1', 'Trigger'),
      avatarSeed: 'HTTPTrigger',
    },
    {
      id: 'node-2',
      template: 'gptAgent',
      kind: 'Agent',
      title: 'GPT-4 Agent',
      x: 320,
      y: 0,
      status: 'ready',
      config: { title: 'GPT-4 Agent', model: 'gpt-4', temperature: 0.7 },
      state: {},
      runtime: { provisionStatus: { state: 'ready' }, isPaused: false },
      capabilities: { provisionable: true, pausable: true },
      ports: makePorts('node-2', 'Agent'),
      avatarSeed: 'GPT4Agent',
    },
    {
      id: 'node-3',
      template: 'searchTool',
      kind: 'Tool',
      title: 'Search Tool',
      x: 640,
      y: 0,
      status: 'ready',
      config: { title: 'Search Tool', toolName: 'web_search' },
      state: {},
      runtime: { provisionStatus: { state: 'ready' }, isPaused: false },
      capabilities: { provisionable: false },
      ports: makePorts('node-3', 'Tool'),
    },
    {
      id: 'node-4',
      template: 'databaseMcp',
      kind: 'MCP',
      title: 'Database MCP',
      x: 0,
      y: 220,
      status: 'ready',
      config: { title: 'Database MCP', server: 'postgres' },
      state: {},
      runtime: { provisionStatus: { state: 'ready' }, isPaused: false },
      capabilities: { provisionable: true, dynamicConfigurable: true },
      ports: makePorts('node-4', 'MCP'),
    },
    {
      id: 'node-5',
      template: 'workspaceDev',
      kind: 'Workspace',
      title: 'Dev Workspace',
      x: 320,
      y: 220,
      status: 'provisioning',
      config: { title: 'Dev Workspace', cpu: 2, memory: 4096 },
      state: {},
      runtime: { provisionStatus: { state: 'provisioning' }, isPaused: false },
      capabilities: { provisionable: true },
      ports: makePorts('node-5', 'Workspace'),
    },
    {
      id: 'node-6',
      template: 'claudeAgent',
      kind: 'Agent',
      title: 'Claude Agent',
      x: 640,
      y: 220,
      status: 'not_ready',
      config: { title: 'Claude Agent', model: 'claude-3' },
      state: {},
      runtime: { provisionStatus: { state: 'not_ready' }, isPaused: true },
      capabilities: { provisionable: true, pausable: true },
      ports: makePorts('node-6', 'Agent'),
      avatarSeed: 'ClaudeAgent',
    },
  ];
}

export const Default: Story = {
  args: {
    nodes: createSampleNodes(),
  },
  parameters: {
    selectedMenuItem: 'graph',
  },
};

export const Saving: Story = {
  args: {
    nodes: createSampleNodes(),
    savingStatus: 'saving',
  },
};

export const SaveError: Story = {
  args: {
    nodes: createSampleNodes(),
    savingStatus: 'error',
    savingErrorMessage: 'Connection to server lost',
  },
};

export const Interactive: Story = {
  render: () => {
    const [nodes, setNodes] = useState<GraphNodeConfig[]>(createSampleNodes());
    const [savingStatus, setSavingStatus] = useState<SavingStatus>('saved');
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleNodeUpdate = useCallback((nodeId: string, updates: GraphNodeUpdate) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          const next: GraphNodeConfig = { ...node };
          if (updates.title !== undefined) {
            next.title = updates.title;
          }
          if (updates.status !== undefined) {
            next.status = updates.status;
          }
          if (updates.config) {
            next.config = { ...updates.config };
          }
          if (updates.state) {
            next.state = { ...updates.state };
          }
          if (updates.runtime) {
            next.runtime = { ...(node.runtime ?? {}), ...updates.runtime };
          }
          return next;
        }),
      );

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      setSavingStatus('saving');
      saveTimeoutRef.current = setTimeout(() => {
        setSavingStatus('saved');
        saveTimeoutRef.current = null;
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
