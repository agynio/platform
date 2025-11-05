import { ObsUiProvider, TracingTracesView } from '@agyn/tracing-ui';

// Use env var with safe default; avoid unsafe cast
const serverUrl = import.meta.env.VITE_OBS_SERVER_URL || 'http://localhost:4319';

export function TracingTraces() {
  return (
    <div className="p-4">
      <ObsUiProvider serverUrl={serverUrl}>
        <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread' }} />
      </ObsUiProvider>
    </div>
  );
}
