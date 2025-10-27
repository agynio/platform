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

// Normalize legacy UI config shapes to server-aligned templates
type TemplateName =
  | 'containerProvider'
  | 'shellTool'
  | 'sendSlackMessageTool'
  | 'slackTrigger'
  | 'githubCloneRepoTool'
  | 'mcpServer'
  | 'finishTool'
  | 'remindMeTool'
  | 'callAgentTool'
  | 'debugTool'
  | 'memory'
  | 'memoryConnector';

type ReferenceValue = { value: string; source?: 'static' | 'vault' };
type EnvItem = { key: string; value: string; source?: 'static' | 'vault' };

function normalizeConfigByTemplate(
  template: TemplateName | string,
  cfg?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const c = { ...(cfg as Record<string, unknown>) };
  switch (template) {
    case 'containerProvider': {
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(
          ([k, v]) => ({ key: k, value: v, source: 'static' }) as EnvItem,
        );
      }
      if ('workingDir' in c) delete (c as Record<string, unknown>).workingDir;
      // Remove fields no longer in schema
      delete (c as Record<string, unknown>).note; // FinishTool carryover
      if (!c.image) delete (c as Record<string, unknown>).image; // optional
      return c;
    }
    case 'callAgentTool': {
      delete (c as Record<string, unknown>).target_agent;
      const resp = (c as Record<string, unknown>).response as string | undefined;
      if (resp && !['sync', 'async', 'ignore'].includes(resp)) (c as Record<string, unknown>).response = 'sync';
      return c;
    }
    case 'shellTool': {
      const rc = c as Record<string, unknown>;
      if (typeof rc.workingDir !== 'undefined' && typeof rc.workdir === 'undefined') {
        rc.workdir = rc.workingDir as unknown;
        delete rc.workingDir;
      }
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(
          ([k, v]) => ({ key: k, value: v, source: 'static' }) as EnvItem,
        );
      }
      return c;
    }
    case 'debugTool': {
      (c as Record<string, unknown>).method = 'POST';
      const p = (c as Record<string, unknown>).path as string | undefined;
      if (p && !p.startsWith('/')) (c as Record<string, unknown>).path = '/' + p;
      return c;
    }
    case 'sendSlackMessageTool': {
      const t = (c as Record<string, unknown>)['bot_token'];
      if (typeof t === 'string')
        (c as Record<string, unknown>)['bot_token'] = { value: t, source: 'static' } as ReferenceValue;
      // Remove extras
      delete (c as Record<string, unknown>).note;
      return c;
    }
    case 'slackTrigger': {
      const at = (c as Record<string, unknown>)['app_token'];
      if (typeof at === 'string')
        (c as Record<string, unknown>)['app_token'] = { value: at, source: 'static' } as ReferenceValue;
      // Remove fields not in staticConfig
      delete (c as Record<string, unknown>).bot_token;
      delete (c as Record<string, unknown>).default_channel;
      return c;
    }
    case 'githubCloneRepoTool': {
      const token = (c as Record<string, unknown>)['token'];
      if (typeof token === 'string')
        (c as Record<string, unknown>)['token'] = { value: token, source: 'static' } as ReferenceValue;
      delete (c as Record<string, unknown>).repoUrl;
      delete (c as Record<string, unknown>).destPath;
      delete (c as Record<string, unknown>).authToken;
      return c;
    }
    case 'mcpServer': {
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(
          ([k, v]) => ({ key: k, value: v, source: 'static' }) as EnvItem,
        );
      }
      // Remove omitted fields per review
      delete (c as Record<string, unknown>).image;
      delete (c as Record<string, unknown>).toolDiscoveryTimeoutMs;
      return c;
    }
    case 'finishTool': {
      delete (c as Record<string, unknown>).note;
      return c;
    }
    case 'remindMeTool': {
      delete (c as Record<string, unknown>).maxActive;
      return c;
    }
    case 'memory': {
      delete (c as Record<string, unknown>).connection;
      return c;
    }
    case 'memoryConnector': {
      const placement = (c as Record<string, unknown>).placement as string | undefined;
      if (placement && !['after_system', 'last_message'].includes(placement))
        (c as Record<string, unknown>).placement = 'after_system';
      const content = (c as Record<string, unknown>).content as string | undefined;
      if (content && !['full', 'tree'].includes(content)) (c as Record<string, unknown>).content = 'tree';
      const mc = (c as Record<string, unknown>).maxChars as number | undefined;
      if (typeof mc === 'number' && mc > 20000) (c as Record<string, unknown>).maxChars = 20000;
      return c;
    }
    default:
      return c;
  }
}

export const api = {
  getTemplates: () => httpJson<TemplateSchema[]>(`/api/graph/templates`),
  // Runs: list and termination controls (no auth/gates)
  listNodeRuns: async (nodeId: string, status: 'running' | 'terminating' | 'all' = 'all') => {
    const res = await httpJson<{
      items: Array<{
        nodeId: string;
        threadId: string;
        runId: string;
        status: string;
        startedAt: string;
        updatedAt: string;
      }>;
    }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/runs?status=${encodeURIComponent(status)}`);
    return res ?? { items: [] };
  },
  terminateRun: (nodeId: string, runId: string) =>
    httpJson<{ status: string }>(
      `/api/graph/nodes/${encodeURIComponent(nodeId)}/runs/${encodeURIComponent(runId)}/terminate`,
      { method: 'POST' },
    ),
  terminateThread: (nodeId: string, threadId: string) =>
    httpJson<{ status: string }>(
      `/api/graph/nodes/${encodeURIComponent(nodeId)}/threads/${encodeURIComponent(threadId)}/terminate`,
      { method: 'POST' },
    ),
  // Reminders for RemindMe tool node
  getNodeReminders: async (nodeId: string) => {
    const res = await httpJson<{ items: ReminderDTO[] }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/reminders`);
    return res ?? { items: [] };
  },
  // Vault autocomplete endpoints (only available when enabled server-side)
  listVaultMounts: () => httpJson<{ items: string[] }>(`/api/vault/mounts`).catch(() => ({ items: [] })),
  listVaultPaths: (mount: string, prefix = '') =>
    httpJson<{ items: string[] }>(
      `/api/vault/kv/${encodeURIComponent(mount)}/paths?prefix=${encodeURIComponent(prefix)}`,
    ).catch(() => ({ items: [] })),
  listVaultKeys: (mount: string, path = '', opts?: { maskErrors?: boolean }) =>
    opts?.maskErrors === false
      ? httpJson<{ items: string[] }>(
          `/api/vault/kv/${encodeURIComponent(mount)}/keys?path=${encodeURIComponent(path)}`,
        )
      : httpJson<{ items: string[] }>(
          `/api/vault/kv/${encodeURIComponent(mount)}/keys?path=${encodeURIComponent(path)}`,
        ).catch(() => ({ items: [] })),
  writeVaultKey: (mount: string, body: { path: string; key: string; value: string }) =>
    httpJson<{ mount: string; path: string; key: string; version: number }>(
      `/api/vault/kv/${encodeURIComponent(mount)}/write`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  getNodeStatus: (nodeId: string) => httpJson<NodeStatus>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/status`),
  getNodeState: (nodeId: string) => httpJson<{ state: Record<string, unknown> }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/state`),
  putNodeState: (nodeId: string, state: Record<string, unknown>) =>
    httpJson<{ state: Record<string, unknown> }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/state`, {
      method: 'PUT',
      body: JSON.stringify({ state }),
    }),
  // Dynamic config schema endpoint: try the newer '/dynamic-config/schema' first, fallback to legacy '/dynamic-config-schema'
  getDynamicConfigSchema: async (nodeId: string): Promise<Record<string, unknown> | null> => {
    // Prefer legacy path first (currently implemented server / tests), then new structured path
    const legacy = buildUrl(`/api/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config-schema`);
    const structured = buildUrl(`/api/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config/schema`);
    async function tryFetch(url: string) {
      try {
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
        if (res.status === 404) return undefined;
        if (!res.ok) return undefined; // treat non-2xx as miss so we can fallback
        try {
          return await res.json();
        } catch {
          return undefined;
        }
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
  postNodeAction: (nodeId: string, action: 'provision' | 'deprovision') =>
    httpJson<void>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
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

// expose for tests without using `any`
Object.defineProperty(api, '__test_normalize', { value: normalizeConfigByTemplate });
