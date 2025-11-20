export type SecretRef = {
  kind: 'vault';
  path: string;
  key: string;
  mount?: string | null;
};

export type VariableRef = {
  kind: 'var';
  name: string;
  default?: string | null;
};

export type Reference = SecretRef | VariableRef;

export type ReferenceSource = Reference['kind'];

export type ReferenceValue<T = string> = T | Reference;

export type ResolutionEventSource = 'secret' | 'variable';

export type ResolutionErrorCode =
  | 'unresolved_reference'
  | 'provider_missing'
  | 'permission_denied'
  | 'invalid_reference'
  | 'type_mismatch'
  | 'max_depth_exceeded'
  | 'cycle_detected';

export type ResolutionEvent = {
  path: string;
  source: ResolutionEventSource;
  cacheHit: boolean;
  resolved?: boolean;
  error?: { code: ResolutionErrorCode; message: string };
};

export type ResolutionReport = {
  events: ResolutionEvent[];
  counts: {
    total: number;
    resolved: number;
    unresolved: number;
    cacheHits: number;
    errors: number;
  };
};
