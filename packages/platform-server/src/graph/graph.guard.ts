import { Injectable } from '@nestjs/common';
import type { PersistedGraph, PersistedGraphUpsertRequest } from './types';
import { GraphErrorCode } from './errors';
import type { LiveGraphRuntime } from './liveGraph.manager';
import type { NodeStatusState } from '../nodes/base/Node';

export type GuardError = Error & { code?: string };

function makeError(code: string, message: string): GuardError {
  const e = new Error(message) as GuardError;
  e.code = code;
  return e;
}

@Injectable()
export class GraphGuard {
  /**
   * Enforce that MCP node config.command cannot be mutated while the node is provisioned
   * (i.e., provisionStatus.state !== 'not_ready').
   */
  enforceMcpCommandMutationGuard(
    before: PersistedGraph | null,
    next: PersistedGraphUpsertRequest,
    runtime: LiveGraphRuntime,
  ): void {
    if (!before) return; // nothing to compare
    const prev = new Map(before.nodes.map((n) => [n.id, n]));
    for (const n of next.nodes || []) {
      const was = prev.get(n.id);
      if (!was) continue;
      if (n.template !== 'mcpServer') continue;
      const prevCmd = was.config?.command;
      const nextCmd = n.config?.command;
      if (prevCmd === nextCmd) continue;
      const status = runtime.getNodeStatus(n.id);
      const st: NodeStatusState | undefined = status?.provisionStatus?.state as NodeStatusState | undefined;
      const state: NodeStatusState = st ?? 'not_ready';
      if (state !== 'not_ready') {
        throw makeError(
          GraphErrorCode.McpCommandMutationForbidden,
          'Cannot change MCP command while node is provisioned',
        );
      }
    }
  }
}

/**
 * Enforce that MCP node config.command cannot be mutated while the node is provisioned
 * (i.e., provisionStatus.state !== 'not_ready').
 */
export function enforceMcpCommandMutationGuard(
  before: PersistedGraph | null,
  next: PersistedGraphUpsertRequest,
  runtime: LiveGraphRuntime,
): void {
  // Delegate to class to preserve existing imports while enabling DI usage elsewhere
  new GraphGuard().enforceMcpCommandMutationGuard(before, next, runtime);
}
