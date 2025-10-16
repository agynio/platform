import type { ReactNode } from 'react';

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

export type StaticConfigViewComponent = (props: StaticConfigViewProps) => ReactNode;
export type DynamicConfigViewComponent = (props: DynamicConfigViewProps) => ReactNode;

export interface ConfigViewRegistration {
  template: string;
  mode: ConfigViewMode;
  component: StaticConfigViewComponent | DynamicConfigViewComponent;
}
