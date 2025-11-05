import { TracingProvider, TracingTracesView } from '@agyn/tracing-ui';
import { config } from '@/config';
const serverUrl = config.tracing.serverUrl;

export function TracingTraces() {
  if (!serverUrl) return <div className="p-4 text-sm">Tracing server URL not configured. Set VITE_TRACING_SERVER_URL.</div>;
  return (
    <div className="p-4">
      <TracingProvider serverUrl={serverUrl}>
        <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread' }} />
      </TracingProvider>
    </div>
  );
}
