import { Navigate, Outlet, Route } from 'react-router-dom';

import { RootLayout } from './layout/RootLayout';
import { AgentsGraphContainer } from './features/graph/containers/AgentsGraphContainer';
import { AgentsChat } from './pages/AgentsChat';
import { AgentsThreads } from './pages/AgentsThreads';
import { AgentsRunTimeline } from './pages/AgentsRunTimeline';
import { AgentsReminders } from './pages/AgentsReminders';
import { TracingTraces } from './pages/TracingTraces';
import { TracingErrors } from './pages/TracingErrors';
import { TracingDisabledPage } from './pages/TracingDisabled';
import { MonitoringContainers } from './pages/MonitoringContainers';
import { MonitoringResources } from './pages/MonitoringResources';
import { MemoryNodesListPage } from './pages/MemoryNodesListPage';
import { MemoryNodeDetailPage } from './pages/MemoryNodeDetailPage';
import { SettingsSecrets } from './pages/SettingsSecrets';
import { SettingsVariables } from './pages/SettingsVariables';

export const appRoutes = (
  <>
    <Route path="/" element={<RootLayout />}>
      <Route index element={<Navigate to="agents/graph" replace />} />

      <Route path="agents" element={<Outlet />}>
        <Route path="graph" element={<AgentsGraphContainer />} />
        <Route path="chat" element={<AgentsChat />} />
        <Route path="threads" element={<AgentsThreads />} />
        <Route path="threads/:threadId" element={<AgentsThreads />} />
        <Route path="threads/:threadId/runs/:runId/timeline" element={<AgentsRunTimeline />} />
        <Route path="reminders" element={<AgentsReminders />} />
      </Route>

      <Route path="tracing" element={<Outlet />}>
        <Route path="traces" element={<TracingTraces />} />
        <Route path="errors" element={<TracingErrors />} />
        <Route
          path="trace/:traceId"
          element={<TracingDisabledPage title="Tracing removed" message="Trace details are no longer available." />}
        />
        <Route
          path="thread/:threadId"
          element={<TracingDisabledPage title="Tracing removed" message="Thread trace views are no longer available." />}
        />
        <Route
          path="errors/tools/:label"
          element={<TracingDisabledPage title="Tracing removed" message="Tool error analytics are no longer available." />}
        />
      </Route>

      <Route path="monitoring" element={<Outlet />}>
        <Route path="containers" element={<MonitoringContainers />} />
        <Route path="resources" element={<MonitoringResources />} />
      </Route>

      <Route path="memory" element={<Outlet />}>
        <Route index element={<MemoryNodesListPage />} />
        <Route path=":nodeId" element={<MemoryNodeDetailPage />} />
      </Route>

      <Route path="settings" element={<Outlet />}>
        <Route path="secrets" element={<SettingsSecrets />} />
        <Route path="variables" element={<SettingsVariables />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/agents/graph" replace />} />
  </>
);
