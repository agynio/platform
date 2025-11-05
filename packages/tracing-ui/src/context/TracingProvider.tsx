import React, { createContext, useContext, useMemo } from 'react';
import { setServerUrl } from '../config';

type TracingContextValue = {
  serverUrl: string;
};

const TracingContext = createContext<TracingContextValue | null>(null);

export function TracingProvider({ serverUrl, children }: { serverUrl: string; children: React.ReactNode }) {
  if (!serverUrl) throw new Error('TracingProvider requires serverUrl');
  // Sync to module-level config for non-React consumers (services).
  setServerUrl(serverUrl);

  const value = useMemo<TracingContextValue>(() => ({ serverUrl }), [serverUrl]);
  return <TracingContext.Provider value={value}>{children}</TracingContext.Provider>;
}

export function useTracing() {
  const ctx = useContext(TracingContext);
  if (!ctx) throw new Error('useTracing must be used within TracingProvider');
  return ctx;
}
