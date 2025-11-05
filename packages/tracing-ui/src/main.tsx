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
import { TracingProvider } from './context/TracingProvider';

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
// Preview harness reads VITE_TRACING_SERVER_URL; fail fast if missing.
const serverUrl = import.meta.env.VITE_TRACING_SERVER_URL as string | undefined;
if (!serverUrl || typeof serverUrl !== 'string') {
  throw new Error('TracingUI requires serverUrl provided via TracingProvider. Set VITE_TRACING_SERVER_URL in env for preview.');
}
createRoot(document.getElementById('root')!).render(
  <TracingProvider serverUrl={serverUrl}>
    <App />
  </TracingProvider>
);
