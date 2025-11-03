import type { NodeStatus, TemplateSchema, ReminderDTO } from '../lib/graph/types';
import { buildUrl, httpJson } from './client';

// Minimal graph type (align with backend PersistedGraphUpsertRequest shape)
export interface PersistedGraphUpsertRequestUI {
  name?: string;
  version?: number;
  nodes: Array<{ id: string; position?: { x: number; y: number }; template: string; config?: Record<string, unknown> }>;
  edges: Array<{ source: string; sourceHandle?: string; target: string; targetHandle?: string }>;
}

function isLikelyJsonSchemaRoot(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return 'type' in o || 'properties' in o || '$ref' in o;
}

type TemplateName =
  | 'workspace'
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
    case 'workspace': {
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(
          ([k, v]) => ({ key: k, value: v, source: 'static' }) as EnvItem,
        );
      }
      if ('workingDir' in c) delete (c as Record<string, unknown>).workingDir;
      delete (c as Record<string, unknown>).note;
      if (!c.image) delete (c as Record<string, unknown>).image;
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
      delete (c as Record<string, unknown>).note;
      return c;
    }
    case 'slackTrigger': {
      const at = (c as Record<string, unknown>)['app_token'];
      if (typeof at === 'string')
        (c as Record<string, unknown>)['app_token'] = { value: at, source: 'static' } as ReferenceValue;
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

export const graph = {
  getTemplates: (base?: string) => httpJson<TemplateSchema[]>(`/api/graph/templates`, undefined, base),
  listNodeRuns: async (nodeId: string, status: 'running' | 'terminating' | 'all' = 'all', base?: string) => {
    const res = await httpJson<{
      items: Array<{
        nodeId: string;
        threadId: string;
        runId: string;
        status: string;
        startedAt: string;
        updatedAt: string;
      }>;
    }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/runs?status=${encodeURIComponent(status)}`, undefined, base);
    return res ?? { items: [] };
  },
  terminateRun: (nodeId: string, runId: string, base?: string) =>
    httpJson<{ status: string }>(
      `/api/graph/nodes/${encodeURIComponent(nodeId)}/runs/${encodeURIComponent(runId)}/terminate`,
      { method: 'POST' },
      base,
    ),
  terminateThread: (nodeId: string, threadId: string, base?: string) =>
    httpJson<{ status: string }>(
      `/api/graph/nodes/${encodeURIComponent(nodeId)}/threads/${encodeURIComponent(threadId)}/terminate`,
      { method: 'POST' },
      base,
    ),
  getNodeReminders: async (nodeId: string, base?: string) => {
    const res = await httpJson<{ items: ReminderDTO[] }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/reminders`, undefined, base);
    return res ?? { items: [] };
  },
  listVaultMounts: (base?: string) => httpJson<{ items: string[] }>(`/api/vault/mounts`, undefined, base).catch(() => ({ items: [] })),
  listVaultPaths: (mount: string, prefix = '', base?: string) =>
    httpJson<{ items: string[] }>(
      `/api/vault/kv/${encodeURIComponent(mount)}/paths?prefix=${encodeURIComponent(prefix)}`,
      undefined,
      base,
    ).catch(() => ({ items: [] })),
  listVaultKeys: (mount: string, path = '', opts?: { maskErrors?: boolean; base?: string }) =>
    opts?.maskErrors === false
      ? httpJson<{ items: string[] }>(
          `/api/vault/kv/${encodeURIComponent(mount)}/keys?path=${encodeURIComponent(path)}`,
          undefined,
          opts?.base,
        )
      : httpJson<{ items: string[] }>(
          `/api/vault/kv/${encodeURIComponent(mount)}/keys?path=${encodeURIComponent(path)}`,
          undefined,
          opts?.base,
        ).catch(() => ({ items: [] })),
  writeVaultKey: (mount: string, body: { path: string; key: string; value: string }, base?: string) =>
    httpJson<{ mount: string; path: string; key: string; version: number }>(
      `/api/vault/kv/${encodeURIComponent(mount)}/write`,
      { method: 'POST', body: JSON.stringify(body) },
      base,
    ),
  getNodeStatus: (nodeId: string, base?: string) => httpJson<NodeStatus>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/status`, undefined, base),
  getNodeState: (nodeId: string, base?: string) => httpJson<{ state: Record<string, unknown> }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/state`, undefined, base),
  putNodeState: (nodeId: string, state: Record<string, unknown>, base?: string) =>
    httpJson<{ state: Record<string, unknown> }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/state`, {
      method: 'PUT',
      body: JSON.stringify({ state }),
    }, base),
  getDynamicConfigSchema: async (nodeId: string, base?: string): Promise<Record<string, unknown> | null> => {
    const legacy = buildUrl(`/api/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config-schema`, base);
    const structured = buildUrl(`/api/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config/schema`, base);
    async function tryFetch(url: string) {
      try {
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
        if (res.status === 404) return undefined;
        if (!res.ok) return undefined;
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
    if (!data || typeof data !== 'object') return null;
    if ('schema' in data) {
      const rec = data as Record<string, unknown> & { schema?: unknown; ready?: unknown };
      const maybeSchema = rec.schema;
      if (isLikelyJsonSchemaRoot(maybeSchema)) return maybeSchema as Record<string, unknown>;
      return null;
    }
    return isLikelyJsonSchemaRoot(data) ? (data as Record<string, unknown>) : null;
  },
  postNodeAction: (nodeId: string, action: 'provision' | 'deprovision', base?: string) =>
    httpJson<void>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }, base),
  saveFullGraph: (graph: PersistedGraphUpsertRequestUI, base?: string) => {
    const normalized = {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, config: normalizeConfigByTemplate(n.template, n.config) })),
    } as PersistedGraphUpsertRequestUI;
    return httpJson<PersistedGraphUpsertRequestUI & { version: number; updatedAt: string }>(`/api/graph`, {
      method: 'POST',
      body: JSON.stringify(normalized),
    }, base);
  },
};

Object.defineProperty(graph, '__test_normalize', { value: normalizeConfigByTemplate });
export const api = graph;

