// hide checkpoint stream panel for now
// import { CheckpointStreamPanel } from '@/components/stream/CheckpointStreamPanel';
//   <h1 className="mb-4 text-xl font-semibold tracking-tight">Checkpoint Writes</h1>
//   <CheckpointStreamPanel />

import { AgentBuilder } from './builder/AgentBuilder';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Runtime graph templates provider (distinct from builder TemplatesProvider)
import { TemplatesProvider as RuntimeTemplatesProvider } from './lib/graph/templates.provider';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeTemplatesProvider>
        <AgentBuilder />
      </RuntimeTemplatesProvider>
    </QueryClientProvider>
  );
}

export default App;
