import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Runtime graph templates provider (distinct from builder TemplatesProvider)
import { TemplatesProvider as RuntimeTemplatesProvider } from './lib/graph/templates.provider';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from './components/ui/tooltip';
import { RootLayout } from './layout/RootLayout';
import { AgentsChat } from './pages/AgentsChat';
import { AgentsThreads } from './pages/AgentsThreads';
import { AgentsReminders } from './pages/AgentsReminders';
import { AgentsMemoryManager } from './pages/AgentsMemoryManager';
import { AgentsRunScreen } from './pages/AgentsRunScreen';
import { TracingTraces } from './pages/TracingTraces';
import { TracingErrors } from './pages/TracingErrors';
import { TracingDisabledPage } from './pages/TracingDisabled';
import { MonitoringContainers } from './pages/MonitoringContainers';
import { MonitoringResources } from './pages/MonitoringResources';
import { SettingsSecrets } from './pages/SettingsSecrets';
import { SettingsVariables } from './pages/SettingsVariables';
import { SettingsLlm } from './pages/SettingsLlm';
import { MemoryNodesListPage } from './pages/MemoryNodesListPage';
import { MemoryNodeDetailPage } from './pages/MemoryNodeDetailPage';
import { AgentsGraphContainer } from './features/graph/containers/AgentsGraphContainer';
import { OnboardingPage } from './pages/OnboardingPage';
import { OnboardingGate } from './features/onboarding/components/OnboardingGate';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeTemplatesProvider>
        <TooltipProvider delayDuration={200}>
          <Routes>
            <Route path="/" element={<Navigate to="/agents/graph" replace />} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route element={<OnboardingGate />}>
              <Route element={<RootLayout />}>
                {/* Agents */}
                <Route path="/agents/graph" element={<AgentsGraphContainer />} />
                <Route path="/agents/chat" element={<AgentsChat />} />
                <Route path="/agents/threads" element={<AgentsThreads />} />
                <Route path="/agents/threads/:threadId" element={<AgentsThreads />} />
                <Route path="/agents/threads/:threadId/runs/:runId/timeline" element={<AgentsRunScreen />} />
                <Route path="/agents/reminders" element={<AgentsReminders />} />
                <Route path="/agents/memory" element={<AgentsMemoryManager />} />

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
                <Route path="/settings/llm" element={<SettingsLlm />} />
                <Route path="/settings/secrets" element={<SettingsSecrets />} />
                <Route path="/settings/variables" element={<SettingsVariables />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/agents/graph" replace />} />
          </Routes>
        </TooltipProvider>
      </RuntimeTemplatesProvider>
    </QueryClientProvider>
  );
}

export default App;
