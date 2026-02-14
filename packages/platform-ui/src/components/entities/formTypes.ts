export type OutgoingConnectionField = {
  id: string;
  edgeId?: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
};

export type IncomingConnectionField = {
  id: string;
  edgeId?: string;
  sourceNodeId: string;
  sourceHandle: string;
  targetHandle: string;
};

export interface EntityFormValues {
  template: string;
  title: string;
  configText: string;
  outgoing: OutgoingConnectionField[];
  incoming: IncomingConnectionField[];
}
