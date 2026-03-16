import { graphSocket } from '@/lib/graph/socket';
import type { NodeStatusEvent } from '@/lib/graph/types';

function toRooms(nodeIds: string[]): string[] {
  return nodeIds
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => `node:${id}`);
}

function connect() {
  return graphSocket.connect();
}

function subscribeToNodes(nodeIds: string[]) {
  const rooms = toRooms(nodeIds);
  if (!rooms.length) return () => {};
  graphSocket.subscribe(rooms);
  return () => {
    graphSocket.unsubscribe(rooms);
  };
}

function onNodeStatus(nodeId: string, handler: (event: NodeStatusEvent) => void) {
  return graphSocket.onNodeStatus(nodeId, handler);
}

function onConnected(handler: () => void) {
  return graphSocket.onConnected(handler);
}

function onReconnected(handler: () => void) {
  return graphSocket.onReconnected(handler);
}

function onDisconnected(handler: () => void) {
  return graphSocket.onDisconnected(handler);
}

function isConnected(): boolean {
  return graphSocket.isConnected();
}

export const graphSocketService = {
  connect,
  subscribeToNodes,
  onNodeStatus,
  onConnected,
  onReconnected,
  onDisconnected,
  isConnected,
};

export type GraphSocketService = typeof graphSocketService;
