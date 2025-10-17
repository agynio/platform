import type { PersistedGraph, PersistedGraphUpsertRequest } from '../graph/types';
import { GraphErrorCode } from '../graph/errors';
import type { LiveGraphRuntime } from '../graph/liveGraph.manager';

export type GuardError = Error & { code?: string };

function makeError(code: string, message: string): GuardError {
  const e = new Error(message) as GuardError;
  e.code = code;
  return e;
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
  if (!before) return; // nothing to compare
  const prev = new Map(before.nodes.map((n) => [n.id, n]));
  for (const n of next.nodes || []) {
    const was = prev.get(n.id);
    if (!was) continue;
    if (n.template !== 'mcpServer') continue;
    const prevCmd = (was.config as any)?.command;
    const nextCmd = (n.config as any)?.command;
    if (prevCmd === nextCmd) continue;
    const status = runtime.getNodeStatus(n.id);
    const state = status?.provisionStatus?.state || 'not_ready';
    if (state !== 'not_ready') {
      throw makeError(GraphErrorCode.McpCommandMutationForbidden, 'Cannot change MCP command while node is provisioned');
    }
  }
}
