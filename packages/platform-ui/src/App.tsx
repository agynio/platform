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
import { TracingTraces } from './pages/TracingTraces';
import { TracingErrors } from './pages/TracingErrors';
import { MonitoringContainers } from './pages/MonitoringContainers';
import { MonitoringResources } from './pages/MonitoringResources';
import { SettingsSecrets } from './pages/SettingsSecrets';

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

            {/* Tracing */}
            <Route path="/tracing/traces" element={<TracingTraces />} />
            <Route path="/tracing/errors" element={<TracingErrors />} />

            {/* Monitoring */}
            <Route path="/monitoring/containers" element={<MonitoringContainers />} />
            <Route path="/monitoring/resources" element={<MonitoringResources />} />

            {/* Settings */}
            <Route path="/settings/secrets" element={<SettingsSecrets />} />
          </Route>
        </Routes>
      </RuntimeTemplatesProvider>
    </QueryClientProvider>
  );
}

export default App;
