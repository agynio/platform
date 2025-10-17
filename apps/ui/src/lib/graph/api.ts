import type { NodeStatus, TemplateSchema, ReminderDTO, PersistedGraphUpsertRequestUI } from './types';
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

// Normalize legacy UI config shapes to server-aligned templates
function normalizeConfigByTemplate(template: string, cfg?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const c = { ...(cfg as Record<string, unknown>) };
  switch (template) {
    case 'containerProvider': {
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(([k, v]) => ({ key: k, value: v, source: 'static' }));
      }
      if ('workingDir' in c) delete (c as any).workingDir;
      // Remove fields no longer in schema
      delete (c as any).note; // FinishTool carryover
      return c;
    }
    case 'shellTool': {
      if ((c as any).workingDir && !(c as any).workdir) {
        (c as any).workdir = (c as any).workingDir;
        delete (c as any).workingDir;
      }
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(([k, v]) => ({ key: k, value: v, source: 'static' }));
      }
      return c;
    }
    case 'sendSlackMessageTool': {
      const t = c.bot_token as any;
      if (typeof t === 'string') c.bot_token = { value: t, source: 'static' };
      // Remove extras
      delete (c as any).note;
      return c;
    }
    case 'slackTrigger': {
      const at = (c as any).app_token;
      if (typeof at === 'string') (c as any).app_token = { value: at, source: 'static' };
      // Remove fields not in staticConfig
      delete (c as any).bot_token;
      delete (c as any).default_channel;
      return c;
    }
    case 'githubCloneRepoTool': {
      const token = (c as any).token;
      if (typeof token === 'string') (c as any).token = { value: token, source: 'static' };
      delete (c as any).repoUrl;
      delete (c as any).destPath;
      delete (c as any).authToken;
      return c;
    }
    case 'mcpServer': {
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(([k, v]) => ({ key: k, value: v, source: 'static' }));
      }
      // Remove omitted fields per review
      delete (c as any).image;
      delete (c as any).toolDiscoveryTimeoutMs;
      return c;
    }
    case 'finishTool': {
      delete (c as any).note;
      return c;
    }
    case 'remindMeTool': {
      delete (c as any).maxActive;
      return c;
    }
    default:
      return c;
  }
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
  saveFullGraph: (graph: PersistedGraphUpsertRequestUI) => {
    const normalized = {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, config: normalizeConfigByTemplate(n.template, n.config) })),
    } as PersistedGraphUpsertRequestUI;
    return httpJson<PersistedGraphUpsertRequestUI & { version: number; updatedAt: string }>(`/api/graph`, {
      method: 'POST',
      body: JSON.stringify(normalized),
    });
  },
};

// expose for tests
(api as any).__test_normalize = normalizeConfigByTemplate;
