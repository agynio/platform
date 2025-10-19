# Apps/UI

Graph UI for managing a single graph runtime: inspect node status, start/stop, pause/resume, and configure static/dynamic settings.

Quickstart
- Install: pnpm -w install
- Run tests: pnpm -w -F @agyn/platform-ui test
- Dev: pnpm -w -F @agyn/platform-ui dev

Env configuration
- VITE_TRACING_SERVER_URL (default http://localhost:4319): tracing-server base URL for spans/logs and realtime.
- VITE_TRACING_UI_BASE (default http://localhost:4320): base URL for deep-linking to the Tracing UI trace page.
 - VITE_API_BASE_URL (default http://localhost:3010): base URL for the Agents API used by the UI. In tests (VITEST), defaults to ''. In production deployments, set VITE_API_BASE_URL to your server origin (e.g., https://agents.example.com).

API base URL precedence
1) VITE_API_BASE_URL
2) API_BASE_URL (Node env)
3) VITEST: '' (tests use relative URLs)
4) default http://localhost:3010

Notes
- Legacy VITE_GRAPH_API_BASE has been removed. Use VITE_API_BASE_URL.

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

Model field (Agent)
- The Agent static configuration view uses a free-text input for model.
- Enter any valid OpenAI/LiteLLM model identifier or LiteLLM alias.
- Examples: `openai/gpt-4o-mini`, `claude-3-5-sonnet`, or a custom alias like `gpt-5`.
- The UI trims whitespace and requires a non-empty value; availability is checked at runtime by the provider.

Routing (Issue #285)
- Client routing via react-router-dom; default redirect to /agents/graph and 404 fallback to /agents/graph.
- Root layout includes persistent left sidebar on desktop (md+) and Drawer on mobile.
- Collapse toggle and per-section open states persist in localStorage.
  - Keys:
    - ui.sidebar.collapsed
    - ui.sidebar.section.agents.open
    - ui.sidebar.section.tracing.open
    - ui.sidebar.section.monitoring.open
    - ui.sidebar.section.settings.open
- Routes:
  - Agents → Graph (/agents/graph) renders AgentBuilder
  - Agents → Chat (/agents/chat) placeholder
  - Tracing → Traces (/tracing/traces) placeholder
  - Tracing → Errors (/tracing/errors) placeholder
  - Monitoring → Containers (/monitoring/containers) placeholder
  - Monitoring → Resources (/monitoring/resources) placeholder
  - Settings → Secrets (/settings/secrets) placeholder
