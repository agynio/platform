export type ProvisionState =
  | 'not_ready'
  | 'provisioning'
  | 'ready'
  | 'error'
  | 'deprovisioning'
  | 'provisioning_error'
  | 'deprovisioning_error';

export interface TemplateSchema {
  name: string;
  title: string;
  kind: string;
  sourcePorts: Record<string, unknown> | string[] | undefined;
  targetPorts: Record<string, unknown> | string[] | undefined;
  capabilities?: {
    pausable?: boolean;
    provisionable?: boolean;
    // whether node supports dynamic config editing
    dynamicConfigurable?: boolean;
    staticConfigurable?: boolean;
  };
  staticConfigSchema?: unknown; // JSON Schema 7
}

export interface ProvisionStatus {
  state: ProvisionState;
  details?: unknown;
}

export interface NodeStatus {
  isPaused?: boolean;
  provisionStatus?: ProvisionStatus;
  // dynamicConfigReady removed
}

export interface NodeStatusEvent extends NodeStatus {
  nodeId: string;
  updatedAt?: string;
}

// Shared DTO for reminders
export interface ReminderDTO {
  id: string;
  threadId: string;
  note: string;
  at: string; // ISO timestamp
}

export interface ReminderCountEvent {
  nodeId: string;
  count: number;
  updatedAt: string; // ISO timestamp
}
