// hide checkpoint stream panel for now
// import { CheckpointStreamPanel } from '@/components/stream/CheckpointStreamPanel';
//   <h1 className="mb-4 text-xl font-semibold tracking-tight">Checkpoint Writes</h1>
//   <CheckpointStreamPanel />

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Runtime graph templates provider (distinct from builder TemplatesProvider)
import { TemplatesProvider as RuntimeTemplatesProvider } from './lib/graph/templates.provider';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RootLayout } from './layout/RootLayout';
import { AgentsChat } from './pages/AgentsChat';
import { AgentsThreads } from './pages/AgentsThreads';
import { AgentsReminders } from './pages/AgentsReminders';
import { AgentsRunTimeline } from './pages/AgentsRunTimeline';
import { TracingTraces } from './pages/TracingTraces';
import { TracingErrors } from './pages/TracingErrors';
import { TracingDisabledPage } from './pages/TracingDisabled';
import { MonitoringContainers } from './pages/MonitoringContainers';
import { MonitoringResources } from './pages/MonitoringResources';
import { SettingsSecrets } from './pages/SettingsSecrets';
import { SettingsVariables } from './pages/SettingsVariables';
import { MemoryNodesListPage } from './pages/MemoryNodesListPage';
import { MemoryNodeDetailPage } from './pages/MemoryNodeDetailPage';
import { AgentsGraphContainer } from './features/graph/containers/AgentsGraphContainer';

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
            <Route path="/agents/graph" element={<AgentsGraphContainer />} />
            <Route path="/agents/chat" element={<AgentsChat />} />
            <Route path="/agents/threads" element={<AgentsThreads />} />
            <Route path="/agents/threads/:threadId" element={<AgentsThreads />} />
            <Route path="/agents/threads/:threadId/runs/:runId/timeline" element={<AgentsRunTimeline />} />
            <Route path="/agents/reminders" element={<AgentsReminders />} />

            {/* Tracing */}
            <Route path="/tracing/traces" element={<TracingTraces />} />
            <Route path="/tracing/errors" element={<TracingErrors />} />
            <Route
              path="/tracing/trace/:traceId"
              element={<TracingDisabledPage title="Tracing removed" message="Trace details are no longer available." />}
            />
            <Route
              path="/tracing/thread/:threadId"
              element={<TracingDisabledPage title="Tracing removed" message="Thread trace views are no longer available." />}
            />
            <Route
              path="/tracing/errors/tools/:label"
              element={<TracingDisabledPage title="Tracing removed" message="Tool error analytics are no longer available." />}
            />

            {/* Monitoring */}
            <Route path="/monitoring/containers" element={<MonitoringContainers />} />
            <Route path="/monitoring/resources" element={<MonitoringResources />} />

            {/* Memory */}
            <Route path="/memory" element={<MemoryNodesListPage />} />
            <Route path="/memory/:nodeId" element={<MemoryNodeDetailPage />} />

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
