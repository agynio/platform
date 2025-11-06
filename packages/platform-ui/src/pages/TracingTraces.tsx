import { TracingProvider, TracingTracesView } from '@agyn/tracing-ui';
import { config } from '@/config';
const serverUrl = `${config.apiBaseUrl}/tracing`;

export function TracingTraces() {
  return (
    <div className="p-4">
      <TracingProvider serverUrl={serverUrl}>
        <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread' }} />
      </TracingProvider>
    </div>
  );
}
