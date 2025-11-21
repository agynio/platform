import type { GraphErrorDetails } from '../shared/types/graph.types';

export class GraphError extends Error implements GraphErrorDetails {
  code: string;
  nodeId?: string | undefined;
  edgeIndex?: number | undefined;
  handle?: string | undefined;
  template?: string | undefined;
  cause?: unknown;
  constructor(details: GraphErrorDetails) {
    super(details.message);
    this.name = 'GraphError';
    this.code = details.code;
    this.nodeId = details.nodeId;
    this.edgeIndex = details.edgeIndex;
    this.handle = details.handle;
    this.template = details.template;
    this.cause = details.cause;
  }
}
