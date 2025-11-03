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
  // dynamicConfigurable removed; dynamic config eliminated
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
<<<<<<< HEAD

export interface ReminderCountEvent {
  nodeId: string;
  count: number;
  updatedAt: string; // ISO timestamp
}
=======
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
