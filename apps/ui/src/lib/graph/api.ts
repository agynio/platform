import type { NodeStatus, TemplateSchema } from './types';
// Minimal graph type (align with backend PersistedGraphUpsertRequest shape)
export interface PersistedGraphUpsertRequestUI {
  name?: string;
  version?: number;
  nodes: Array<{ id: string; position?: { x: number; y: number }; template: string; config?: Record<string, unknown> }>;
  edges: Array<{ source: string; sourceHandle?: string; target: string; targetHandle?: string }>;
}
// Base host for graph API; override via VITE_GRAPH_API_BASE
interface ViteEnv { VITE_GRAPH_API_BASE?: string }
const envHost = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: ViteEnv }).env?.VITE_GRAPH_API_BASE : undefined);
// In test (node) environment we prefer relative paths so MSW handlers using relative URL match.
const isNode = typeof window === 'undefined';
// In vitest (process.env.VITEST) use relative URLs so MSW relative handlers intercept.
const isVitest = typeof process !== 'undefined' && typeof (process as unknown as { env?: Record<string, string | undefined> }).env?.VITEST === 'string';
const BASE = envHost || (isVitest ? '' : isNode ? '' : 'http://localhost:3010');

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

function isLikelyJsonSchemaRoot(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  // Minimal signal: presence of at least one of 'type', 'properties', or '$ref'
  return 'type' in o || 'properties' in o || '$ref' in o;
}

export const api = {
  getTemplates: () => http<TemplateSchema[]>(`${BASE}/graph/templates`),
  getNodeStatus: (nodeId: string) => http<NodeStatus>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/status`),
  // Dynamic config schema endpoint: try the newer '/dynamic-config/schema' first, fallback to legacy '/dynamic-config-schema'
  getDynamicConfigSchema: async (nodeId: string): Promise<Record<string, unknown> | null> => {
    // Prefer legacy path first (currently implemented server / tests), then new structured path
    const legacy = `${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config-schema`;
    const structured = `${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config/schema`;
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
    http<void>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
  saveFullGraph: (graph: PersistedGraphUpsertRequestUI) =>
    http<PersistedGraphUpsertRequestUI & { version: number; updatedAt: string }>(`${BASE}/api/graph`, {
      method: 'POST',
      body: JSON.stringify(graph),
    }),
};
