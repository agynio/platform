import React from 'react';
import './index.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TracesListPage } from './pages/TracesListPage';
import { TracePage } from './pages/TracePage';
import { ThreadPage } from './pages/ThreadPage';
import { ErrorsByToolPage } from './pages/ErrorsByToolPage';
import { ToolErrorsPage } from './pages/ToolErrorsPage';
import { EntryLayout } from './components/EntryLayout';
import { ObsUiProvider } from './context/ObsUiProvider';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Routes with shared top navigation */}
        <Route element={<EntryLayout />}> 
          <Route path="/" element={<TracesListPage />} />
          <Route path="/errors/tools" element={<ErrorsByToolPage />} />
          <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
        </Route>
        {/* Detail routes without the entry layout */}
        <Route path="/trace/:traceId" element={<TracePage />} />
        <Route path="/thread/:threadId" element={<ThreadPage />} />
      </Routes>
    </BrowserRouter>
  );
}
// Require serverUrl via DOM data attribute or global variable; fail fast if missing.
const rootEl = document.getElementById('root') as (HTMLElement & { dataset?: DOMStringMap }) | null;
const serverUrl = (rootEl?.dataset?.serverUrl as string | undefined) || (globalThis as any)?.__OBS_UI_SERVER_URL;
if (!serverUrl || typeof serverUrl !== 'string') {
  throw new Error('Tracing UI requires serverUrl provided via ObsUiProvider. Set data-server-url on #root or global __OBS_UI_SERVER_URL.');
}
createRoot(document.getElementById('root')!).render(
  <ObsUiProvider serverUrl={serverUrl}>
    <App />
  </ObsUiProvider>
);
