import { TracingProvider, TracingTracesView } from '@agyn/tracing-ui';
import { config } from '@/config';

export function TracingTraces() {
  return (
    <div className="p-4">
      <TracingProvider serverUrl={config.tracingApiBaseUrl}>
        <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread' }} />
      </TracingProvider>
    </div>
  );
}
