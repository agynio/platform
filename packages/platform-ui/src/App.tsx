// hide checkpoint stream panel for now
// import { CheckpointStreamPanel } from '@/components/stream/CheckpointStreamPanel';
//   <h1 className="mb-4 text-xl font-semibold tracking-tight">Checkpoint Writes</h1>
//   <CheckpointStreamPanel />

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Runtime graph templates provider (distinct from builder TemplatesProvider)
import { TemplatesProvider as RuntimeTemplatesProvider } from './lib/graph/templates.provider';
import { Routes } from 'react-router-dom';
import { appRoutes } from './appRoutes.tsx';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeTemplatesProvider>
        <Routes>{appRoutes}</Routes>
      </RuntimeTemplatesProvider>
    </QueryClientProvider>
  );
}

export default App;
