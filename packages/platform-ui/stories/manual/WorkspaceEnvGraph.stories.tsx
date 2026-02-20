import { useCallback, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { addEdge, useEdgesState, useNodesState, type Connection, type Edge, type Node } from '@xyflow/react';

import { GraphCanvas, type GraphNodeData } from '../../src/components/GraphCanvas';
import { EnvEditor } from '../../src/components/nodeProperties/EnvEditor';
import { useEnvEditorState } from '../../src/components/nodeProperties/hooks/useEnvEditorState';
import type { NodeConfig } from '../../src/components/nodeProperties/types';

const meta: Meta = {
  title: 'Manual/WorkspaceEnvGraph',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof GraphCanvas>;

const initialNodes: Node<GraphNodeData>[] = [
  {
    id: 'workspace-root',
    type: 'graphNode',
    position: { x: 0, y: 0 },
    data: {
      kind: 'Workspace',
      title: 'Workspace Node',
      outputs: [{ id: 'output', title: 'Output' }],
    },
    selected: true,
  },
];

const initialConfig: NodeConfig = {
  kind: 'Workspace',
  title: 'Workspace Node',
  env: [
    { id: 'env-1', name: 'API_TOKEN', value: 'value', source: 'static' },
    { id: 'env-2', name: 'DB_SECRET', value: { path: 'db/creds', key: 'password' }, source: 'vault' },
  ],
};

function WorkspaceEnvGraphHarness() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [config, setConfig] = useState<NodeConfig>(initialConfig);

  const envState = useEnvEditorState({
    configRecord: config,
    onConfigChange: (updates) => setConfig((prev) => ({ ...prev, ...updates })),
  });

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge(connection, current));
  }, [setEdges]);

  const onNodesDelete = useCallback((deleted: Node<GraphNodeData>[]) => {
    const deletedIds = new Set(deleted.map((node) => node.id));
    setNodes((current) => current.filter((node) => !deletedIds.has(node.id)));
  }, [setNodes]);

  return (
    <div className="flex min-h-screen bg-[var(--agyn-bg-secondary)]">
      <div className="flex-1 min-h-screen border-r border-[var(--agyn-border-default)]">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
        />
      </div>
      <div className="w-[420px] bg-white p-6 overflow-y-auto">
        <EnvEditor
          title="Environment Variables"
          isOpen
          onOpenChange={() => undefined}
          secretSuggestions={['vault/app/secret', 'vault/db/password']}
          variableSuggestions={['ORG_ID', 'WORKSPACE_ID']}
          {...envState}
        />
      </div>
    </div>
  );
}

export const Default: Story = {
  render: () => <WorkspaceEnvGraphHarness />,
};
