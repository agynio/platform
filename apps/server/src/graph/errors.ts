import { GraphError } from './types';

// Helper constructors for consistent error creation
export const Errors = {
  unknownTemplate: (template: string, nodeId: string) =>
    new GraphError({
      code: 'UNKNOWN_TEMPLATE',
      message: `Unknown template "${template}" for node ${nodeId}`,
      nodeId,
      template,
    }),
  duplicateNodeId: (nodeId: string) =>
    new GraphError({
      code: 'DUPLICATE_NODE_ID',
      message: `Duplicate node id: ${nodeId}`,
      nodeId,
    }),
  missingNode: (missingId: string, edgeIndex: number) =>
    new GraphError({
      code: 'MISSING_NODE',
      message: `Edge references missing node id: ${missingId}`,
      edgeIndex,
    }),
  unresolvedHandle: (handle: string, nodeId: string, edgeIndex: number) =>
    new GraphError({
      code: 'UNRESOLVED_HANDLE',
      message: `Handle "${handle}" not found on node ${nodeId}`,
      nodeId,
      handle,
      edgeIndex,
    }),
  ambiguousCallable: (edgeIndex: number) =>
    new GraphError({
      code: 'AMBIGUOUS_CALLABLE',
      message: 'Both endpoints are callable (methods); exactly one must be callable',
      edgeIndex,
    }),
  missingCallable: (edgeIndex: number) =>
    new GraphError({
      code: 'MISSING_CALLABLE',
      message: 'No callable endpoint on edge; exactly one must be a method',
      edgeIndex,
    }),
  invocationError: (edgeIndex: number, cause: unknown) =>
    new GraphError({
      code: 'INVOCATION_ERROR',
      message: 'Error during method invocation',
      edgeIndex,
      cause,
    }),
  unreadyDependency: (nodeId: string, depId: string) =>
    new GraphError({
      code: 'UNREADY_DEPENDENCY',
      message: `Factory for node ${nodeId} requested dependency ${depId} before it was created (ensure ordering)`,
      nodeId,
    }),
  missingConfigure: (nodeId: string) =>
    new GraphError({
      code: 'MISSING_CONFIGURE',
      message: `Config provided for node ${nodeId} but instance has no configure method`,
      nodeId,
    }),
};

export type ErrorCode = keyof typeof Errors;
