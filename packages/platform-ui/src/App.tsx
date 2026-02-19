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
import { AgentsGraphContainer } from './features/graph/containers/AgentsGraphContainer';
import { OnboardingPage } from './pages/OnboardingPage';
import { OnboardingGate } from './features/onboarding/components/OnboardingGate';
import { AgentsListPage } from './pages/AgentsListPage';
import { TriggersListPage } from './pages/TriggersListPage';
import { ToolsListPage } from './pages/ToolsListPage';
import { WorkspacesListPage } from './pages/WorkspacesListPage';
import { MemoryEntitiesListPage } from './pages/MemoryEntitiesListPage';
import { McpServersListPage } from './pages/McpServersListPage';
import { EntityUpsertPage } from './pages/entities/EntityUpsertPage';
import { EXCLUDED_WORKSPACE_TEMPLATES, INCLUDED_MEMORY_WORKSPACE_TEMPLATES } from './features/entities/api/graphEntities';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeTemplatesProvider>
        <TooltipProvider delayDuration={200}>
          <Routes>
            <Route path="/" element={<Navigate to="/agents" replace />} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route element={<OnboardingGate />}>
              <Route element={<RootLayout />}>
                {/* Agents */}
                <Route path="/agents" element={<AgentsListPage />} />
                <Route path="/agents/new" element={<EntityUpsertPage kind="agent" mode="create" listPath="/agents" />} />
                <Route path="/agents/:entityId/edit" element={<EntityUpsertPage kind="agent" mode="edit" listPath="/agents" />} />
                <Route path="/agents/graph" element={<AgentsGraphContainer />} />
                <Route path="/agents/chat" element={<AgentsChat />} />
                <Route path="/agents/threads" element={<AgentsThreads />} />
                <Route path="/agents/threads/:threadId" element={<AgentsThreads />} />
                <Route path="/agents/threads/:threadId/runs/:runId/timeline" element={<AgentsRunScreen />} />
                <Route path="/agents/reminders" element={<AgentsReminders />} />
                <Route path="/agents/memory" element={<AgentsMemoryManager />} />

                {/* Entities */}
                <Route path="/triggers" element={<TriggersListPage />} />
                <Route path="/triggers/new" element={<EntityUpsertPage kind="trigger" mode="create" listPath="/triggers" />} />
                <Route path="/triggers/:entityId/edit" element={<EntityUpsertPage kind="trigger" mode="edit" listPath="/triggers" />} />
                <Route path="/tools" element={<ToolsListPage />} />
                <Route path="/tools/new" element={<EntityUpsertPage kind="tool" mode="create" listPath="/tools" />} />
                <Route path="/tools/:entityId/edit" element={<EntityUpsertPage kind="tool" mode="edit" listPath="/tools" />} />
                <Route path="/mcp" element={<McpServersListPage />} />
                <Route path="/mcp/new" element={<EntityUpsertPage kind="mcp" mode="create" listPath="/mcp" />} />
                <Route path="/mcp/:entityId/edit" element={<EntityUpsertPage kind="mcp" mode="edit" listPath="/mcp" />} />
                <Route path="/workspaces" element={<WorkspacesListPage />} />
                <Route
                  path="/workspaces/new"
                  element={(
                    <EntityUpsertPage
                      kind="workspace"
                      mode="create"
                      listPath="/workspaces"
                      templateExcludeNames={EXCLUDED_WORKSPACE_TEMPLATES}
                    />
                  )}
                />
                <Route
                  path="/workspaces/:entityId/edit"
                  element={(
                    <EntityUpsertPage
                      kind="workspace"
                      mode="edit"
                      listPath="/workspaces"
                      templateExcludeNames={EXCLUDED_WORKSPACE_TEMPLATES}
                    />
                  )}
                />
                <Route path="/memory" element={<MemoryEntitiesListPage />} />
                <Route
                  path="/memory/new"
                  element={(
                    <EntityUpsertPage
                      kind="workspace"
                      mode="create"
                      listPath="/memory"
                      templateIncludeNames={INCLUDED_MEMORY_WORKSPACE_TEMPLATES}
                    />
                  )}
                />
                <Route
                  path="/memory/:entityId/edit"
                  element={(
                    <EntityUpsertPage
                      kind="workspace"
                      mode="edit"
                      listPath="/memory"
                      templateIncludeNames={INCLUDED_MEMORY_WORKSPACE_TEMPLATES}
                    />
                  )}
                />

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
                {/* Settings */}
                <Route path="/settings/llm" element={<SettingsLlm />} />
                <Route path="/settings/secrets" element={<SettingsSecrets />} />
                <Route path="/settings/variables" element={<SettingsVariables />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/agents" replace />} />
          </Routes>
        </TooltipProvider>
      </RuntimeTemplatesProvider>
    </QueryClientProvider>
  );
}

export default App;
