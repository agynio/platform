import { EdgeDef } from './types';

export type PortKind = 'instance' | 'method';

export interface BasePortConfig { kind: PortKind; }

export interface MethodPortConfig extends BasePortConfig {
  kind: 'method';
  create: string; // method name to establish connection
  destroy?: string; // optional method name to reverse; if absent runtime will call create with undefined
}

export interface InstancePortConfig extends BasePortConfig {
  kind: 'instance';
}

export type PortConfig = MethodPortConfig | InstancePortConfig;

export interface TemplatePortConfig {
  sourcePorts?: Record<string, PortConfig>;
  targetPorts?: Record<string, PortConfig>;
}

export type TemplatePortsRegistry = Record<string, TemplatePortConfig>;

export interface ResolvedPort {
  role: 'source' | 'target';
  handle: string;
  config: PortConfig;
}

export interface ResolvedEdgePorts {
  source: ResolvedPort;
  target: ResolvedPort;
  callableSide: 'source' | 'target';
  methodPort: ResolvedPort; // the method side
  instancePort: ResolvedPort; // the instance side
}

export class PortResolutionError extends Error {
  constructor(message: string, public edge: EdgeDef) { super(message); }
}
