# Apps/UI

Graph UI for managing a single graph runtime: inspect node status, start/stop, pause/resume, and configure static/dynamic settings.

Quickstart
- Install: pnpm -w install
- Run tests: pnpm -w -F ui test
- Dev: pnpm -w -F ui dev

Provider setup
```tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesProvider } from './src/lib/graph/templates.provider';

const qc = new QueryClient();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <TemplatesProvider>{children}</TemplatesProvider>
    </QueryClientProvider>
  );
}
```

Docs
- See docs/ui/graph for:
  - Data layer (API, hooks, socket)
  - TemplatesProvider + capability helpers
  - Components: NodeDetailsPanel, StaticConfigForm, DynamicConfigForm
  - Socket.io status updates (no polling)

Notes
- Server emits JSON Schema 7 generated from Zod v4. UI uses RJSF with ajv8.
- Actions are optimistic; authoritative socket events reconcile cache.
