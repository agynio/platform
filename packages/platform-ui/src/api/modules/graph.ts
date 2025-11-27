import { http } from '@/api/http';
import type { TemplateSchema, NodeStatus, PersistedGraphUpsertRequestUI, ReminderDTO } from '@/api/types/graph';
import type { PersistedGraph, PersistedGraphNode } from '@agyn/shared';
import { collectVaultRefs } from '@/lib/vault/collect';
import { parseVaultRef, isValidVaultRef } from '@/lib/vault/parse';
import axios from 'axios';

// Keep normalize function identical to prior implementation
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

// ReferenceValue and EnvItem shapes are inferred where needed; no explicit aliases to avoid unused type lint errors.

function normalizeConfigByTemplate(
  template: TemplateName | string,
  cfg?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const c = { ...(cfg as Record<string, unknown>) };
  switch (template) {
    case 'workspace': {
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(([name, v]) => ({ name, value: v, source: 'static' }));
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
        c.env = Object.entries(c.env as Record<string, string>).map(([name, v]) => ({ name, value: v, source: 'static' }));
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
      if (typeof t === 'string') (c as Record<string, unknown>)['bot_token'] = { value: t, source: 'static' };
      delete (c as Record<string, unknown>).note;
      return c;
    }
    case 'slackTrigger': {
      const at = (c as Record<string, unknown>)['app_token'];
      if (typeof at === 'string') (c as Record<string, unknown>)['app_token'] = { value: at, source: 'static' };
      const bt = (c as Record<string, unknown>)['bot_token'];
      if (typeof bt === 'string') (c as Record<string, unknown>)['bot_token'] = { value: bt, source: 'static' };
      delete (c as Record<string, unknown>).default_channel;
      return c;
    }
    case 'githubCloneRepoTool': {
      const token = (c as Record<string, unknown>)['token'];
      if (typeof token === 'string') (c as Record<string, unknown>)['token'] = { value: token, source: 'static' };
      delete (c as Record<string, unknown>).repoUrl;
      delete (c as Record<string, unknown>).destPath;
      delete (c as Record<string, unknown>).authToken;
      return c;
    }
    case 'mcpServer': {
      if (c.env && !Array.isArray(c.env) && typeof c.env === 'object') {
        c.env = Object.entries(c.env as Record<string, string>).map(([name, v]) => ({ name, value: v, source: 'static' }));
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

function isLikelyJsonSchemaRoot(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return 'type' in o || 'properties' in o || '$ref' in o;
}

export const graph = {
  // Templates
  getTemplates: () => http.get<TemplateSchema[]>(`/api/graph/templates`),

  // Node runs
  listNodeRuns: async (nodeId: string, status: 'running' | 'terminating' | 'all' = 'all') => {
    const res = await http.get<{ items: Array<{ nodeId: string; threadId: string; runId: string; status: string; startedAt: string; updatedAt: string }> }>(
      `/api/graph/nodes/${encodeURIComponent(nodeId)}/runs`,
      { params: { status } },
    );
    return res ?? { items: [] };
  },
  terminateRun: (runId: string) => http.post<{ ok: boolean }>(`/api/agents/runs/${encodeURIComponent(runId)}/terminate`),
  terminateThread: (nodeId: string, threadId: string) =>
    http.post<{ status: string }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/threads/${encodeURIComponent(threadId)}/terminate`),

  // Reminders
  getNodeReminders: async (nodeId: string) => {
    const res = await http.get<{ items: ReminderDTO[] }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/reminders`);
    return res ?? { items: [] };
  },

  // Vault helpers
  listVaultMounts: () => http.get<{ items: string[] }>(`/api/vault/mounts`).catch(() => ({ items: [] })),
  listVaultPaths: (mount: string, prefix = '') =>
    http
      .get<{ items: string[] }>(`/api/vault/kv/${encodeURIComponent(mount)}/paths`, { params: { prefix } })
      .catch(() => ({ items: [] })),
  listVaultKeys: (mount: string, path = '', opts?: { maskErrors?: boolean }) => {
    const req = http.get<{ items: string[] }>(`/api/vault/kv/${encodeURIComponent(mount)}/keys`, { params: { path } });
    return opts?.maskErrors === false ? req : req.catch(() => ({ items: [] }));
  },
  readVaultKey: async (mount: string, path: string, key: string): Promise<{ value: string }> => {
    return http.get<{ value: string }>(
      `/api/vault/kv/${encodeURIComponent(mount)}/read`,
      { params: { path, key } },
    );
  },
  writeVaultKey: (mount: string, body: { path: string; key: string; value: string }) =>
    http.post<{ mount: string; path: string; key: string; version: number }>(`/api/vault/kv/${encodeURIComponent(mount)}/write`, body),

  // Node status/state
  getNodeStatus: (nodeId: string) => http.get<NodeStatus>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/status`),
  getNodeState: (nodeId: string) => http.get<{ state: Record<string, unknown> }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/state`),
  putNodeState: (nodeId: string, state: Record<string, unknown>) =>
    http.put<{ state: Record<string, unknown> }>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/state`, { state }),

  // Dynamic config schema (404 -> null)
  getDynamicConfigSchema: async (nodeId: string): Promise<Record<string, unknown> | null> => {
    try {
      const data = await http.get<unknown>(
        `/api/graph/nodes/${encodeURIComponent(nodeId)}/dynamic-config/schema`,
      );
      if (!data || typeof data !== 'object') return null;
      if ('schema' in (data as Record<string, unknown>)) {
        const rec = data as Record<string, unknown> & { schema?: unknown };
        const maybeSchema = rec.schema;
        return isLikelyJsonSchemaRoot(maybeSchema) ? (maybeSchema as Record<string, unknown>) : null;
      }
      return isLikelyJsonSchemaRoot(data) ? (data as Record<string, unknown>) : null;
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 404) return null;
      return null;
    }
  },

  // Node action
  postNodeAction: (nodeId: string, action: 'provision' | 'deprovision') =>
    http.post<void>(`/api/graph/nodes/${encodeURIComponent(nodeId)}/actions`, { action }),

  // Full graph
  saveFullGraph: (g: PersistedGraphUpsertRequestUI) => {
    const normalized: PersistedGraphUpsertRequestUI = {
      ...g,
      nodes: g.nodes.map((n) => ({ ...n, config: normalizeConfigByTemplate(n.template, n.config) })),
    };
    return http.post<PersistedGraphUpsertRequestUI & { version: number; updatedAt: string }>(`/api/graph`, normalized);
  },
  getFullGraph: () => http.get<PersistedGraph>(`/api/graph`),
};

Object.defineProperty(graph, '__test_normalize', { value: normalizeConfigByTemplate });

export type { PersistedGraphUpsertRequestUI };

// Secrets helpers/types (authoritative definitions for Settings/Secrets)
export type SecretKey = { mount: string; path: string; key: string };
export type SecretEntry = SecretKey & { required: boolean; present: boolean };
export type SecretFilter = 'used' | 'missing' | 'all';

export function computeRequiredKeys(graph: PersistedGraph): SecretKey[] {
  const uniq = new Set<string>();
  const out: SecretKey[] = [];
  for (const n of (graph.nodes || []) as PersistedGraphNode[]) {
    const refs = collectVaultRefs(n.config ?? {});
    for (const r of refs) {
      if (!isValidVaultRef(r)) continue;
      const p = parseVaultRef(r);
      if (!(p.mount && p.path && p.key)) continue;
      const id = `${p.mount}::${p.path}::${p.key}`;
      if (uniq.has(id)) continue;
      uniq.add(id);
      out.push({ mount: p.mount, path: p.path, key: p.key });
    }
  }
  return out;
}

export function computeSecretsUnion(required: SecretKey[], available: SecretKey[]): SecretEntry[] {
  const reqSet = new Set(required.map((r) => `${r.mount}::${r.path}::${r.key}`));
  const byId = new Map<string, SecretEntry>();

  for (const a of available) {
    const id = `${a.mount}::${a.path}::${a.key}`;
    byId.set(id, { ...a, required: reqSet.has(id), present: true });
  }
  for (const r of required) {
    const id = `${r.mount}::${r.path}::${r.key}`;
    if (byId.has(id)) {
      const e = byId.get(id)!;
      if (!e.required) byId.set(id, { ...e, required: true });
    } else {
      byId.set(id, { ...r, required: true, present: false });
    }
  }

  return Array.from(byId.values());
}
