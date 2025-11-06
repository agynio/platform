import { TracingProvider, TracingErrorsView } from '@agyn/tracing-ui';
import { getTracingBase } from '@/api/tracing';

export function TracingErrors() {
  return (
    <div className="p-4">
      <TracingProvider serverUrl={getTracingBase()}>
        <TracingErrorsView basePaths={{ errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </TracingProvider>
    </div>
  );
}
