import { ObsUiProvider, TracingErrorsView } from '@agyn/obs-ui';

// Use env var with safe default; avoid unsafe cast
const serverUrl = import.meta.env.VITE_OBS_SERVER_URL || 'http://localhost:4319';

export function TracingErrors() {
  return (
    <div className="p-4">
      <ObsUiProvider serverUrl={serverUrl}>
        <TracingErrorsView basePaths={{ errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </ObsUiProvider>
    </div>
  );
}
