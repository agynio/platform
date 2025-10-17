# Data layer: API, hooks, socket

Overview
- REST client for graph endpoints
- Socket client wrapper for realtime updates
- React Query hooks for data fetching/mutations
- Templates cache provider
- Capability helpers for conditional UI

API client usage
```ts
import { api } from '@/lib/graph/api';

const templates = await api.getTemplates();
const status = await api.getNodeStatus('node-1');
await api.postNodeAction('node-1', 'provision');
await api.postNodeConfig('node-1', { systemPrompt: '...' });
const dynSchema = await api.getDynamicConfigSchema('node-1');
await api.postDynamicConfig('node-1', { flag: true });
```

Hooks
```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { useTemplates, useNodeStatus, useNodeAction, useSetNodeConfig, useDynamicConfig } from '@/lib/graph/hooks';

function Node({ nodeId }: { nodeId: string }) {
  const status = useNodeStatus(nodeId);
  const action = useNodeAction(nodeId);
  return (
    <div>
      <div>state: {status.data?.provisionStatus?.state || 'not_ready'}</div>
      <button onClick={() => action.mutate('provision')}>Start</button>
    </div>
  );
}
```

Socket client
- The socket client wraps socket.io-client and exposes onNodeStatus(nodeId, cb)
- useNodeStatus registers a listener and sets React Query cache on events
- useNodeAction applies optimistic updates and rolls back on errors; socket events reconcile authoritative state

TemplatesProvider and capabilities
```tsx
import { TemplatesProvider, useTemplatesCache } from '@/lib/graph/templates.provider';
import { canPause } from '@/lib/graph/capabilities';

function App() {
  return (
    <QueryClientProvider client={qc}>
      <TemplatesProvider>
        <YourRoutes />
      </TemplatesProvider>
    </QueryClientProvider>
  );
}

function Example({ templateName }: { templateName: string }) {
  const { getTemplate } = useTemplatesCache();
  const tmpl = getTemplate(templateName);
  const pausable = tmpl ? canPause(tmpl) : false;
  // render based on pausable...
}
```
