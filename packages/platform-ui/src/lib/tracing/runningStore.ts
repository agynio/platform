import { useSyncExternalStore } from 'react';

// With tracing removed from the platform, running span counts are no longer
// sourced from the tracing service. This module remains as a thin compatibility
// layer to keep the builder UI stable, always reporting a count of zero.

function subscribe(_callback: () => void) {
  return () => {};
}

function getSnapshot() {
  return 0;
}

export function useRunningCount(_nodeId: string, _bucket?: 'agent' | 'tool'): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Test helper retained for backwards compatibility with existing imports.
export function __resetRunningStoreForTest() {
  /* no-op */
}
