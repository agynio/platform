import { TracingProvider, TracingErrorsView } from '@agyn/tracing-ui';
import { config } from '@/config';
const serverUrl = config.tracing.serverUrl;

export function TracingErrors() {
  if (!serverUrl) return <div className="p-4 text-sm">Tracing server URL not configured. Set VITE_TRACING_SERVER_URL.</div>;
  return (
    <div className="p-4">
      <TracingProvider serverUrl={serverUrl}>
        <TracingErrorsView basePaths={{ errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </TracingProvider>
    </div>
  );
}
