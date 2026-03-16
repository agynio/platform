// Graph-related DTOs
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
  description?: string;
  sourcePorts: Record<string, unknown> | string[] | undefined;
  targetPorts: Record<string, unknown> | string[] | undefined;
  capabilities?: {
    pausable?: boolean;
    provisionable?: boolean;
    dynamicConfigurable?: boolean;
    staticConfigurable?: boolean;
  };
  staticConfigSchema?: unknown;
}

export interface ProvisionStatus { state: ProvisionState; details?: unknown }
export interface NodeStatus { provisionStatus?: ProvisionStatus }

export interface ReminderDTO { id: string; threadId: string; note: string; at: string }
