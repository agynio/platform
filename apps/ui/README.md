# Apps/UI

Graph UI for managing a single graph runtime: inspect node status, start/stop, pause/resume, and configure static/dynamic settings.

Quickstart
- Install: pnpm -w install
- Run tests: pnpm -w -F ui test
- Dev: pnpm -w -F ui dev

Env configuration
- VITE_OBS_SERVER_URL (default http://localhost:4319): obs-server base URL for spans/logs and realtime.
- VITE_OBS_UI_BASE (default http://localhost:4320): base URL for deep-linking to the Observability UI trace page.
 - VITE_API_BASE_URL (default http://localhost:3010): base URL for the Agents API used by the UI. In tests (VITEST), defaults to ''. In production deployments, set VITE_API_BASE_URL to your server origin (e.g., https://agents.example.com).

API base URL precedence
1) VITE_API_BASE_URL
2) API_BASE_URL (Node env)
3) VITE_GRAPH_API_BASE (legacy)
4) VITEST: '' (tests use relative URLs)
5) default http://localhost:3010

Notes
- VITE_GRAPH_API_BASE is deprecated; prefer VITE_API_BASE_URL.

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
  - Components: NodeDetailsPanel, RightPropertiesPanel (uses custom ConfigViews)
  - Socket.io status updates (no polling)

Docs
- Custom ConfigViews use shadcn/ui primitives and a typed registry. See docs/ui/config-views.md
- Actions are optimistic; authoritative socket events reconcile cache.
