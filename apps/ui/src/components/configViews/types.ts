import type { ReactNode } from 'react';

// Config view modes supported by the registry
export type ConfigViewMode = 'static' | 'dynamic';

// Props contract for a static-config custom view
export interface StaticConfigViewProps {
  templateName: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  disabled?: boolean;
  // Optional validation hook; component may call with a list of messages
  onValidate?: (errors: string[]) => void;
}

// Props contract for a dynamic-config custom view
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
  template: string; // template name, e.g. 'simpleAgent'
  mode: ConfigViewMode;
  component: StaticConfigViewComponent | DynamicConfigViewComponent;
}

