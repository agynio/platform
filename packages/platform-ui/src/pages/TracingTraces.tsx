import { ObsUiProvider, TracingTracesView } from '@agyn/tracing-ui';
const serverUrl = import.meta.env.VITE_TRACING_SERVER_URL as string | undefined;

export function TracingTraces() {
  if (!serverUrl) return <div className="p-4 text-sm">Tracing server URL not configured. Set VITE_TRACING_SERVER_URL.</div>;
  return (
    <div className="p-4">
      <ObsUiProvider serverUrl={serverUrl}>
        <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread', errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </ObsUiProvider>
    </div>
  );
}
