import { NodeStatus, TemplateSchema } from './types';

const BASE = '';

async function http<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as unknown as T;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as unknown as T;
  }
}

export const api = {
  getTemplates: () => http<TemplateSchema[]>(`${BASE}/graph/templates`),
  getNodeStatus: (nodeId: string) => http<NodeStatus>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/status`),
  postNodeAction: (nodeId: string, action: 'pause' | 'resume' | 'provision' | 'deprovision') =>
    http<void>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
  postNodeConfig: (nodeId: string, config: Record<string, unknown>) =>
    http<void>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/config`, { method: 'POST', body: JSON.stringify(config) }),
  getDynamicConfigSchema: (nodeId: string) =>
    http<unknown>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config-schema`),
  postDynamicConfig: (nodeId: string, config: Record<string, unknown>) =>
    http<void>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config`, { method: 'POST', body: JSON.stringify(config) }),
};
