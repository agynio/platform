import { TracingProvider, TracingErrorsView } from '@agyn/tracing-ui';
import { config } from '@/config';
const serverUrl = `${config.apiBaseUrl}/tracing`;

export function TracingErrors() {
  return (
    <div className="p-4">
      <TracingProvider serverUrl={serverUrl}>
        <TracingErrorsView basePaths={{ errorsTools: '/tracing/errors/tools', toolErrors: '/tracing/errors/tools' }} />
      </TracingProvider>
    </div>
  );
}
