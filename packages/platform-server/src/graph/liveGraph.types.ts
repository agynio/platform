import { EdgeDef, GraphDefinition, GraphError, NodeDef } from './types';
import { Node } from '../nodes/base/Node';

export interface LiveNode {
  id: string;
  template: string;
  instance: Node;
  config?: Record<string, unknown>;
}

export interface ExecutedEdgeRecord {
  key: string; // serialized edge key
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  reversible: boolean;
  reversal?: () => Promise<void> | void;
  argumentSnapshot?: unknown; // value passed to callable (for potential reversal)
}

export interface GraphRuntimeState {
  nodes: Map<string, LiveNode>;
  executedEdges: Map<string, ExecutedEdgeRecord>;
  inboundEdges: Map<string, Set<string>>; // nodeId -> edge keys
  outboundEdges: Map<string, Set<string>>;
  version: number;
  lastGraph?: GraphDefinition;
}

export interface EdgeBehavior {
  idempotent?: boolean; // safe to call repeatedly
  reversible?: boolean; // can be reversed
  reverseHandle?: string; // handle name to reverse with same argument
  skipIfExecuted?: boolean; // do not re-execute if recorded
}

export type EdgeBehaviorKey = string; // e.g. `${template}.${handle}` (from callable side)

export interface GraphDiffResult {
  addedNodes: string[];
  removedNodes: string[];
  recreatedNodes: string[];
  updatedConfigNodes: string[];
  addedEdges: string[]; // edge keys
  removedEdges: string[]; // edge keys
  errors: GraphError[];
  version: number;
}

export interface InternalDiffComputation {
  addedNodes: NodeDef[];
  removedNodeIds: string[];
  recreatedNodeIds: string[];
  configUpdateNodeIds: string[];
  addedEdges: EdgeDef[];
  removedEdges: EdgeDef[];
}

export const edgeKey = (e: EdgeDef): string => `${e.source}:${e.sourceHandle}->${e.target}:${e.targetHandle}`;
