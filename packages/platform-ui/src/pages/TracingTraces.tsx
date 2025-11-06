import { TracingProvider, TracingTracesView } from '@agyn/tracing-ui';
import { getTracingBase } from '@/api/tracing';

export function TracingTraces() {
  return (
    <div className="p-4">
      <TracingProvider serverUrl={getTracingBase()}>
        <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread' }} />
      </TracingProvider>
    </div>
  );
}
