// Local shim to satisfy TS type resolution for @agyn/tracing-ui during app typecheck
// The actual package provides components at runtime; we don't need its types here.
declare module '@agyn/tracing-ui' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  import type React from 'react';

  export const TracingProvider: React.ComponentType<{ serverUrl: string; children?: React.ReactNode }>;
  export const TraceDetailView: React.ComponentType<{ traceId: string }>;
  export const ThreadView: React.ComponentType<{ threadId: string }>;
  export const ToolErrorsView: React.ComponentType<{ label: string; range: { from: string; to: string } }>;  
  export const TracingErrorsView: React.ComponentType<{ basePaths: { errorsTools: string; toolErrors: string } }>;
  export const TracingTracesView: React.ComponentType<{ basePaths: { trace: string; thread: string } }>;
}
