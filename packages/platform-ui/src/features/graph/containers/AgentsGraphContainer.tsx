import { useMemo } from 'react';
import { GraphLayout } from '@/components/agents/GraphLayout';
import { useGraphData } from '../hooks/useGraphData';
import { useGraphSocket } from '../hooks/useGraphSocket';

export function AgentsGraphContainer() {
  const { nodes, loading, savingState, savingErrorMessage, updateNode, applyNodeStatus, applyNodeState } = useGraphData();

  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);

  useGraphSocket({
    nodeIds,
    onStatus: (event) => {
      const { nodeId, updatedAt: _ignored, ...status } = event;
      applyNodeStatus(nodeId, status);
    },
    onState: (event) => {
      applyNodeState(event.nodeId, event.state ?? {});
    },
  });

  if (loading && nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading graph...
      </div>
    );
  }

  return (
    <GraphLayout
      nodes={nodes}
      savingStatus={savingState.status}
      savingErrorMessage={savingErrorMessage}
      onNodeUpdate={updateNode}
    />
  );
}
