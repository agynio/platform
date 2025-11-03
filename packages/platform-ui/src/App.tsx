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
import { TracingTraces } from './pages/TracingTraces';
import { TracingErrors } from './pages/TracingErrors';
import { ObsUiProvider, TraceDetailView, ThreadView, ToolErrorsView } from '@agyn/tracing-ui';
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

// Standardized env var for tracing server base
const serverUrl = import.meta.env.VITE_TRACING_SERVER_URL as string | undefined;

function TraceDetailRoute() {
  const params = useParams();
  if (!serverUrl) return <div className="p-4 text-sm">Tracing server URL not configured. Set VITE_TRACING_SERVER_URL.</div>;
  return (
    <ObsUiProvider serverUrl={serverUrl}>
      <TraceDetailView traceId={params.traceId!} />
    </ObsUiProvider>
  );
}

function ThreadRoute() {
  const params = useParams();
  if (!serverUrl) return <div className="p-4 text-sm">Tracing server URL not configured. Set VITE_TRACING_SERVER_URL.</div>;
  return (
    <ObsUiProvider serverUrl={serverUrl}>
      <ThreadView threadId={params.threadId!} />
    </ObsUiProvider>
  );
}

function ToolErrorsRoute() {
  const params = useParams();
  const [sp] = useSearchParams();
  const from = sp.get('from') || new Date(Date.now() - 6 * 3600_000).toISOString();
  const to = sp.get('to') || new Date().toISOString();
  if (!serverUrl) return <div className="p-4 text-sm">Tracing server URL not configured. Set VITE_TRACING_SERVER_URL.</div>;
  return (
    <ObsUiProvider serverUrl={serverUrl}>
      <ToolErrorsView label={decodeURIComponent(params.label!)} range={{ from, to }} />
    </ObsUiProvider>
  );
}
