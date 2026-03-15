import { graph as graphApi } from '@/api/modules/graph';
import * as nixApi from '@/api/modules/nix';
import type { NodeStatus, TemplateSchema } from '@/api/types/graph';

interface McpToolResponse {
  name: string;
  description?: string;
}

interface DiscoverToolsResponse {
  tools: McpToolResponse[];
  updatedAt?: string;
}

function assertTemplateArray(payload: unknown): TemplateSchema[] {
  if (!Array.isArray(payload)) {
    throw new Error('Templates payload invalid');
  }
  return payload as TemplateSchema[];
}

type ProvisionState = NodeStatus['provisionStatus'] extends { state: infer S } ? S : never;

function assertNodeStatus(payload: unknown): NodeStatus {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as Record<string, unknown>;
  const result: NodeStatus = {};
  const provisionStatus = record.provisionStatus;
  if (provisionStatus != null && typeof provisionStatus !== 'object') {
    throw new Error('Node status invalid: provisionStatus');
  }
  if (provisionStatus && typeof provisionStatus === 'object') {
    const state = (provisionStatus as Record<string, unknown>).state;
    if (typeof state === 'string') {
      result.provisionStatus = {
        state: state as ProvisionState,
        details: (provisionStatus as Record<string, unknown>).details,
      };
    }
  }
  return result;
}

function assertDiscoverTools(payload: unknown): DiscoverToolsResponse {
  if (!payload || typeof payload !== 'object') {
    return { tools: [] };
  }
  const record = payload as Record<string, unknown>;
  const tools = Array.isArray(record.tools)
    ? record.tools
        .map((tool) => {
          if (!tool || typeof tool !== 'object') return null;
          const toolRecord = tool as Record<string, unknown>;
          const name = typeof toolRecord.name === 'string' ? toolRecord.name : '';
          if (!name) return null;
          const description = typeof toolRecord.description === 'string' ? toolRecord.description : undefined;
          const response: McpToolResponse = description ? { name, description } : { name };
          return response;
        })
        .filter((tool): tool is McpToolResponse => tool !== null)
    : [];
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : undefined;
  return { tools, updatedAt };
}

function assertStringArray(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is string => typeof item === 'string');
}

function toObjectArray<T>(items: string[], shape: (value: string) => T): T[] {
  return items.map((value) => shape(value)).filter((item) => item != null);
}

async function fetchTemplates(): Promise<TemplateSchema[]> {
  const payload = await graphApi.getTemplates();
  return assertTemplateArray(payload);
}

async function fetchNodeStatus(nodeId: string): Promise<NodeStatus> {
  const payload = await graphApi.getNodeStatus(nodeId);
  return assertNodeStatus(payload);
}

async function discoverTools(nodeId: string): Promise<DiscoverToolsResponse> {
  const payload = await graphApi.discoverTools(nodeId);
  return assertDiscoverTools(payload);
}

async function searchNixPackages(query: string): Promise<Array<{ name: string }>> {
  const packages = await nixApi.fetchPackages(query);
  return packages
    .map((entry) => (entry && typeof entry.name === 'string' ? { name: entry.name } : null))
    .filter((item): item is { name: string } => item !== null);
}

async function listNixPackageVersions(name: string): Promise<Array<{ version: string }>> {
  const versions = await nixApi.fetchVersions(name);
  const items = assertStringArray(versions);
  return toObjectArray(items, (version) => ({ version }));
}

async function resolveNixSelection(
  name: string,
  version: string,
): Promise<{ version: string; commit: string; attr: string }> {
  const resolved = await nixApi.resolvePackage(name, version);
  if (!resolved) {
    throw new Error('Failed to resolve Nix package');
  }
  const { version: resolvedVersion, commitHash, attributePath } = resolved;
  if (!resolvedVersion || !commitHash || !attributePath) {
    throw new Error('Invalid Nix package resolution payload');
  }
  return { version: resolvedVersion, commit: commitHash, attr: attributePath };
}

async function listVaultMounts(): Promise<string[]> {
  const payload = await graphApi.listVaultMounts();
  const items = (payload && typeof payload === 'object' ? (payload as Record<string, unknown>).items : null) ?? [];
  return assertStringArray(items);
}

async function listVaultPaths(mount: string, prefix = ''): Promise<string[]> {
  const payload = await graphApi.listVaultPaths(mount, prefix);
  const items = (payload && typeof payload === 'object' ? (payload as Record<string, unknown>).items : null) ?? [];
  return assertStringArray(items);
}

async function listVaultKeys(
  mount: string,
  path = '',
  opts?: { maskErrors?: boolean },
): Promise<string[]> {
  const payload = await graphApi.listVaultKeys(mount, path, opts);
  const items = (payload && typeof payload === 'object' ? (payload as Record<string, unknown>).items : null) ?? [];
  return assertStringArray(items);
}

async function provisionNode(nodeId: string): Promise<void> {
  await graphApi.postNodeAction(nodeId, 'provision');
}

async function deprovisionNode(nodeId: string): Promise<void> {
  await graphApi.postNodeAction(nodeId, 'deprovision');
}

export const graphApiService = {
  fetchTemplates,
  fetchNodeStatus,
  discoverTools,
  searchNixPackages,
  listNixPackageVersions,
  resolveNixSelection,
  listVaultMounts,
  listVaultPaths,
  listVaultKeys,
  provisionNode,
  deprovisionNode,
};

export type GraphApiService = typeof graphApiService;
export type GraphDiscoverToolsResponse = DiscoverToolsResponse;
