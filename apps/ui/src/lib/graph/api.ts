import type { NodeStatus, TemplateSchema, ReminderDTO } from './types';
import { buildUrl, httpJson } from '../apiClient';

// Minimal graph type (align with backend PersistedGraphUpsertRequest shape)
export interface PersistedGraphUpsertRequestUI {
  name?: string;
  version?: number;
  nodes: Array<{ id: string; position?: { x: number; y: number }; template: string; config?: Record<string, unknown> }>;
  edges: Array<{ source: string; sourceHandle?: string; target: string; targetHandle?: string }>;
}
// All base URL logic moved to apiClient.ts

function isLikelyJsonSchemaRoot(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  // Minimal signal: presence of at least one of 'type', 'properties', or '$ref'
  return 'type' in o || 'properties' in o || '$ref' in o;
}

export const api = {
  getTemplates: () => httpJson<TemplateSchema[]>(`/graph/templates`),
  // Runs: list and termination controls (no auth/gates)
  listNodeRuns: (nodeId: string, status: 'running' | 'terminating' | 'all' = 'all') =>
    httpJson<{ items: Array<{ nodeId: string; threadId: string; runId: string; status: string; startedAt: string; updatedAt: string }> }>(
      `/graph/nodes/${encodeURIComponent(nodeId)}/runs?status=${encodeURIComponent(status)}`,
    ),
  terminateRun: (nodeId: string, runId: string) =>
    httpJson<{ status: string }>(`/graph/nodes/${encodeURIComponent(nodeId)}/runs/${encodeURIComponent(runId)}/terminate`, { method: 'POST' }),
  terminateThread: (nodeId: string, threadId: string) =>
    httpJson<{ status: string }>(`/graph/nodes/${encodeURIComponent(nodeId)}/threads/${encodeURIComponent(threadId)}/terminate`, { method: 'POST' }),
  // Reminders for RemindMe tool node
  getNodeReminders: (nodeId: string) => httpJson<{ items: ReminderDTO[] }>(`/graph/nodes/${encodeURIComponent(nodeId)}/reminders`),
  // Vault autocomplete endpoints (only available when enabled server-side)
  listVaultMounts: () => httpJson<{ items: string[] }>(`/api/vault/mounts`).catch(() => ({ items: [] })),
  listVaultPaths: (mount: string, prefix = '') =>
    httpJson<{ items: string[] }>(`/api/vault/kv/${encodeURIComponent(mount)}/paths?prefix=${encodeURIComponent(prefix)}`).catch(() => ({ items: [] })),
  listVaultKeys: (mount: string, path = '', opts?: { maskErrors?: boolean }) =>
    (opts?.maskErrors === false
      ? httpJson<{ items: string[] }>(`/api/vault/kv/${encodeURIComponent(mount)}/keys?path=${encodeURIComponent(path)}`)
      : httpJson<{ items: string[] }>(`/api/vault/kv/${encodeURIComponent(mount)}/keys?path=${encodeURIComponent(path)}`).catch(() => ({ items: [] }))
    ),
  writeVaultKey: (mount: string, body: { path: string; key: string; value: string }) =>
    httpJson<{ mount: string; path: string; key: string; version: number }>(
      `/api/vault/kv/${encodeURIComponent(mount)}/write`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  getNodeStatus: (nodeId: string) => httpJson<NodeStatus>(`/graph/nodes/${encodeURIComponent(nodeId)}/status`),
  // Dynamic config schema endpoint: try the newer '/dynamic-config/schema' first, fallback to legacy '/dynamic-config-schema'
  getDynamicConfigSchema: async (nodeId: string): Promise<Record<string, unknown> | null> => {
    // Prefer legacy path first (currently implemented server / tests), then new structured path
    const legacy = buildUrl(`/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config-schema`);
    const structured = buildUrl(`/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config/schema`);
    async function tryFetch(url: string) {
      try {
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
        if (res.status === 404) return undefined;
        if (!res.ok) return undefined; // treat non-2xx as miss so we can fallback
        try { return await res.json(); } catch { return undefined; }
      } catch {
        return undefined;
      }
    }
    let data = await tryFetch(legacy);
    if (!data) data = await tryFetch(structured);

    // Normalize accepted shapes: either { ready, schema } or plain schema object.
    // If wrapper or ambiguous/empty, return null so UI does not render invalid form.
    if (!data || typeof data !== 'object') return null;

    // If server wraps shape as { ready, schema }
    if ('schema' in data) {
      const rec = data as Record<string, unknown> & { schema?: unknown; ready?: unknown };
      const maybeSchema = rec.schema;
      if (isLikelyJsonSchemaRoot(maybeSchema)) return maybeSchema as Record<string, unknown>;
      return null;
    }

    // If plain object, validate it's likely a schema; otherwise null
    return isLikelyJsonSchemaRoot(data) ? (data as Record<string, unknown>) : null;
  },
  postNodeAction: (nodeId: string, action: 'pause' | 'resume' | 'provision' | 'deprovision') =>
    httpJson<void>(`/graph/nodes/${encodeURIComponent(nodeId)}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
  saveFullGraph: (graph: PersistedGraphUpsertRequestUI) =>
    httpJson<PersistedGraphUpsertRequestUI & { version: number; updatedAt: string }>(`/api/graph`, {
      method: 'POST',
      body: JSON.stringify(graph),
    }),
};
