import { AgentNode } from '../nodes/agent/agent.node';
import type { LiveNode } from '../graph/liveGraph.types';
import { TemplateRegistry } from '../graph-core/templateRegistry';

export type AgentRuntimeInstance = Pick<AgentNode, 'invoke' | 'status'> &
  Partial<Pick<AgentNode, 'listQueuedPreview'>>;

export function isAgentRuntimeInstance(value: unknown): value is AgentRuntimeInstance {
  if (value instanceof AgentNode) return true;
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentNode>;
  return typeof candidate.invoke === 'function' && typeof candidate.status === 'string';
}

export function hasQueuedPreviewCapability(
  value: AgentRuntimeInstance,
): value is AgentRuntimeInstance & Pick<AgentNode, 'listQueuedPreview'> {
  return typeof value.listQueuedPreview === 'function';
}

export function isAgentTemplate(template: string, registry: TemplateRegistry): boolean {
  const meta = registry.getMeta(template);
  return meta?.kind === 'agent';
}

export function isAgentLiveNode(node: LiveNode | undefined, registry: TemplateRegistry): node is LiveNode {
  if (!node) return false;
  if (isAgentRuntimeInstance(node.instance)) return true;
  return isAgentTemplate(node.template, registry);
}
