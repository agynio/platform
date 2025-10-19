// Capability interfaces for nodes (triggers, agents, mcp servers, tools)
// IMPORTANT: Use JSON Schema types from @types/json-schema (no custom definitions)

import { JSONSchema } from 'zod/v4/core';

export interface Pausable {
  pause(): Promise<void> | void;
  resume(): Promise<void> | void;
  isPaused(): boolean;
}

export interface StaticConfigurable {
  setConfig(cfg: Record<string, unknown>): Promise<void> | void;
  getConfigSchema(): JSONSchema.BaseSchema;
}

// Backward compatibility alias used by graph runtime today
export type Configurable = StaticConfigurable;

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

// ---------- Type guards ----------
export function isDynamicConfigurable<Config = Record<string, unknown>>(
  obj: unknown,
): obj is DynamicConfigurable<Config> {
  return !!obj && typeof (obj as any).isDynamicConfigReady === 'function';
}

// Named guards used by runtime (no default export)
export function hasSetConfig(
  x: unknown,
): x is { setConfig: (cfg: Record<string, unknown>) => unknown } {
  return !!x && typeof (x as any).setConfig === 'function';
}

export function hasSetDynamicConfig(
  x: unknown,
): x is { setDynamicConfig: (cfg: Record<string, unknown>) => unknown } {
  return !!x && typeof (x as any).setDynamicConfig === 'function';
}
