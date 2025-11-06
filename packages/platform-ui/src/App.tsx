// hide checkpoint stream panel for now
// import { CheckpointStreamPanel } from '@/components/stream/CheckpointStreamPanel';
//   <h1 className="mb-4 text-xl font-semibold tracking-tight">Checkpoint Writes</h1>
//   <CheckpointStreamPanel />

import { AgentBuilder } from './builder/AgentBuilder';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Runtime graph templates provider (distinct from builder TemplatesProvider)
import { TemplatesProvider as RuntimeTemplatesProvider } from './lib/graph/templates.provider';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RootLayout } from './layout/RootLayout';
import { AgentsChat } from './pages/AgentsChat';
import { AgentsThreads } from './pages/AgentsThreads';
import { AgentsReminders } from './pages/AgentsReminders';
import { TracingTraces } from './pages/TracingTraces';
import { TracingErrors } from './pages/TracingErrors';
import { TracingProvider, TraceDetailView, ThreadView, ToolErrorsView } from '@agyn/tracing-ui';
import { config } from './config';
import { useParams, useSearchParams } from 'react-router-dom';
import { MonitoringContainers } from './pages/MonitoringContainers';
import { MonitoringResources } from './pages/MonitoringResources';
import { SettingsSecrets } from './pages/SettingsSecrets';
import { SettingsVariables } from './pages/SettingsVariables';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeTemplatesProvider>
        <Routes>
          {/* Index and 404 fallback redirect */}
          <Route path="/" element={<Navigate to="/agents/graph" replace />} />
          <Route path="*" element={<Navigate to="/agents/graph" replace />} />

          {/* Root layout wraps all primary routes */}
          <Route element={<RootLayout />}>
            {/* Agents */}
            <Route path="/agents/graph" element={<AgentBuilder />} />
            <Route path="/agents/chat" element={<AgentsChat />} />
            <Route path="/agents/threads" element={<AgentsThreads />} />
            <Route path="/agents/reminders" element={<AgentsReminders />} />

            {/* Tracing */}
            <Route path="/tracing/traces" element={<TracingTraces />} />
            <Route path="/tracing/errors" element={<TracingErrors />} />
            <Route path="/tracing/trace/:traceId" element={<TraceDetailRoute />} />
            <Route path="/tracing/thread/:threadId" element={<ThreadRoute />} />
            <Route path="/tracing/errors/tools/:label" element={<ToolErrorsRoute />} />

            {/* Monitoring */}
            <Route path="/monitoring/containers" element={<MonitoringContainers />} />
            <Route path="/monitoring/resources" element={<MonitoringResources />} />

            {/* Settings */}
            <Route path="/settings/secrets" element={<SettingsSecrets />} />
            <Route path="/settings/variables" element={<SettingsVariables />} />
          </Route>
        </Routes>
      </RuntimeTemplatesProvider>
    </QueryClientProvider>
  );
}

export default App;

// Centralized derived base for tracing server
const serverUrl = config.tracingServerUrl;

function TraceDetailRoute() {
  const params = useParams();
  return (
    <TracingProvider serverUrl={serverUrl}>
      <TraceDetailView traceId={params.traceId!} />
    </TracingProvider>
  );
}

function ThreadRoute() {
  const params = useParams();
  return (
    <TracingProvider serverUrl={serverUrl}>
      <ThreadView threadId={params.threadId!} />
    </TracingProvider>
  );
}

function ToolErrorsRoute() {
  const params = useParams();
  const [sp] = useSearchParams();
  const from = sp.get('from') || new Date(Date.now() - 6 * 3600_000).toISOString();
  const to = sp.get('to') || new Date().toISOString();
  return (
    <TracingProvider serverUrl={serverUrl}>
      <ToolErrorsView label={decodeURIComponent(params.label!)} range={{ from, to }} />
    </TracingProvider>
  );
}
