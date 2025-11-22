import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraphScreen, type GraphNode } from '@agyn/ui-new';
import { graph as graphApi } from '@/api/modules/graph';
import { graphSocket } from '@/lib/graph/socket';
import type { PersistedGraphNode } from '@agyn/shared';
import type { ProvisionState } from '@/lib/graph/types';

function mapProvisionState(state: ProvisionState | undefined): GraphNode['status'] {
  switch (state) {
    case 'ready':
      return 'ready';
    case 'provisioning':
      return 'provisioning';
    case 'deprovisioning':
      return 'deprovisioning';
    case 'deprovisioning_error':
      return 'deprovisioning_error';
    case 'provisioning_error':
    case 'error':
      return 'provisioning_error';
    default:
      return 'not_ready';
  }
}

function mapTemplateToKind(template: string): GraphNode['kind'] {
  const name = template.toLowerCase();
  if (name.includes('trigger')) return 'Trigger';
  if (name.includes('workspace')) return 'Workspace';
  if (name.includes('tool')) return 'Tool';
  if (name.includes('mcp')) return 'MCP';
  return 'Agent';
}

export function AgentsGraphNew() {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<PersistedGraphNode[]>([]);
  const [statusMap, setStatusMap] = useState<Map<string, GraphNode['status']>>(new Map());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const hydrateStatuses = useCallback(async (graphNodes: PersistedGraphNode[]) => {
    const entries = await Promise.all(
      graphNodes.map(async (node) => {
        try {
          const status = await graphApi.getNodeStatus(node.id);
          return [node.id, mapProvisionState(status?.provisionStatus?.state as ProvisionState | undefined)] as const;
        } catch (_err) {
          return [node.id, 'not_ready'] as const;
        }
      }),
    );
    setStatusMap(new Map(entries));
  }, []);

  const loadGraph = useCallback(async () => {
    try {
      const fullGraph = await graphApi.getFullGraph();
      const graphNodes = fullGraph?.nodes ?? [];
      setNodes(graphNodes);
      await hydrateStatuses(graphNodes);
      if (graphNodes.length && !selectedNodeId) {
        setSelectedNodeId(graphNodes[0].id);
      }
    } catch (_err) {
      setNodes([]);
      setStatusMap(new Map());
    }
  }, [hydrateStatuses, selectedNodeId]);

  useEffect(() => {
    loadGraph().catch(() => {});
  }, [loadGraph]);

  useEffect(() => {
    if (!nodes.length) return;
    const rooms: string[] = [];
    const cleanups: Array<() => void> = [];

    for (const node of nodes) {
      const room = `node:${node.id}`;
      rooms.push(room);
      const offStatus = graphSocket.onNodeStatus(node.id, (event) => {
        setStatusMap((prev) => {
          const next = new Map(prev);
          next.set(event.nodeId, mapProvisionState(event.provisionStatus?.state as ProvisionState | undefined));
          return next;
        });
      });
      cleanups.push(offStatus);
    }

    if (rooms.length) graphSocket.subscribe(rooms);
    const offReconnect = graphSocket.onReconnected(() => {
      loadGraph().catch(() => {});
    });

    return () => {
      cleanups.forEach((fn) => fn());
      offReconnect();
      if (rooms.length) graphSocket.unsubscribe(rooms);
    };
  }, [nodes, loadGraph]);

  const uiNodes = useMemo<GraphNode[]>(() => {
    return nodes.map((node, index) => {
      const position = node.position ?? { x: 200 + index * 120, y: 160 + (index % 2) * 160 };
      const status = statusMap.get(node.id) ?? 'not_ready';
      return {
        id: node.id,
        kind: mapTemplateToKind(node.template ?? ''),
        title: node.template ?? node.id,
        x: position.x,
        y: position.y,
        status,
        data: node.config ?? {},
      } satisfies GraphNode;
    });
  }, [nodes, statusMap]);

  const handleBack = useCallback(() => {
    navigate('/agents/threads');
  }, [navigate]);

  return (
    <GraphScreen
      nodes={uiNodes}
      selectedNodeId={selectedNodeId}
      onSelectNode={setSelectedNodeId}
      onBack={handleBack}
      renderSidebar={false}
    />
  );
}
