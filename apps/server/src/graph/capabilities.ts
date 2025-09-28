// Capability interfaces for nodes (triggers, agents, mcp servers, tools)
// IMPORTANT: Use JSON Schema types from @types/json-schema (no custom definitions)

import { JSONSchema } from 'zod/v4/core';

export interface Pausable {
  pause(): Promise<void> | void;
  resume(): Promise<void> | void;
  isPaused(): boolean;
}

// Unified minimal configurable contract used by the graph runtime
export interface Configurable {
  setConfig(cfg: Record<string, unknown>): Promise<void> | void;
}

export type ProvisionState = 'not_ready' | 'provisioning' | 'ready' | 'error' | 'deprovisioning';

export interface ProvisionStatus<Details = any> {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  state: ProvisionState;
  details?: Details;
}

export interface Provisionable<S extends ProvisionStatus = ProvisionStatus> {
  getProvisionStatus(): S;
  provision(): Promise<void>;
  deprovision(): Promise<void>;
  onProvisionStatusChange(listener: (s: S) => void): () => void;
}

export interface DynamicConfigurable<Config = Record<string, unknown>> {
  isDynamicConfigReady(): boolean;
  getDynamicConfigSchema(): JSONSchema.BaseSchema | undefined;
  setDynamicConfig(cfg: Config): Promise<void> | void;
  onDynamicConfigChanged(listener: (cfg: Config) => void): () => void;
}

// Attachment safety interfaces (port wiring contracts)
export interface ContainerProviderAware { setContainerProvider(p?: any): void; }
export interface ToolAttachable { addTool(t: any): void; removeTool(t: any): void; }
export interface McpAttachable { addMcpServer(s: any): Promise<void>; removeMcpServer(s: any): Promise<void>; }
export interface AgentCallable { setAgent(a?: any): void; }

// ---------- Type guards ----------
export function isDynamicConfigurable<Config = Record<string, unknown>>(
  obj: unknown,
): obj is DynamicConfigurable<Config> {
  return !!obj && typeof (obj as any).isDynamicConfigReady === 'function';
}

export function isContainerProviderAware(obj: unknown): obj is ContainerProviderAware {
  return !!obj && typeof (obj as any).setContainerProvider === 'function';
}
export function isToolAttachable(obj: unknown): obj is ToolAttachable {
  return !!obj && typeof (obj as any).addTool === 'function' && typeof (obj as any).removeTool === 'function';
}
export function isMcpAttachable(obj: unknown): obj is McpAttachable {
  return !!obj && typeof (obj as any).addMcpServer === 'function' && typeof (obj as any).removeMcpServer === 'function';
}
export function isAgentCallable(obj: unknown): obj is AgentCallable {
  return !!obj && typeof (obj as any).setAgent === 'function';
}
