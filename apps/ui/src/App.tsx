import { CheckpointStreamPanel } from '@/components/stream/CheckpointStreamPanel';

function App() {
  return (
    <div className="min-h-svh w-full p-6">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Checkpoint Writes</h1>
      <CheckpointStreamPanel />
    </div>
  );
}

export default App;
