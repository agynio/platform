import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TracesListPage } from './pages/TracesListPage';
import { TracePage } from './pages/TracePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TracesListPage />} />
        <Route path="/trace/:traceId" element={<TracePage />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
