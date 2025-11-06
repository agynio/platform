import { TracingProvider, TracingErrorsView } from '@agyn/tracing-ui';
import { config } from '@/config';

export function TracingErrors() {
  return (
    <div className="p-4">
      <TracingProvider serverUrl={config.tracingServerUrl}>
        <TracingErrorsView basePaths={{ errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </TracingProvider>
    </div>
  );
}
