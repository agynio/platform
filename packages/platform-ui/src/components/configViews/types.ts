import type { ComponentType } from 'react';

export type ConfigViewMode = 'static' | 'dynamic';

export interface StaticConfigViewProps {
  templateName: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  disabled?: boolean;
  onValidate?: (errors: string[]) => void;
}

export interface DynamicConfigViewProps {
  nodeId: string;
  templateName: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  disabled?: boolean;
}

export type StaticConfigViewComponent = ComponentType<StaticConfigViewProps>;
export type DynamicConfigViewComponent = ComponentType<DynamicConfigViewProps>;

export interface ConfigViewRegistration {
  template: string;
  mode: ConfigViewMode;
  component: StaticConfigViewComponent | DynamicConfigViewComponent;
}
