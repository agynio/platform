# @agyn/tracing-ui

React component library for Observability UI.

Key concepts
- Library exports React views and a provider. The library must not read import.meta.env directly.
- Use TracingProvider to pass serverUrl at runtime. Only the dev preview app may read env.
- Import styles for markdown/log rendering from './styles.css'.

Usage
```
import { TracingProvider, TracingTracesView } from '@agyn/tracing-ui';
import '@agyn/tracing-ui/styles.css';

<TracingProvider serverUrl={process.env.MY_OBS_URL!}>
  <TracingTracesView basePaths={{ trace: '/tracing/trace', thread: '/tracing/thread' }} />
</TracingProvider>
```

Development
```
pnpm --filter @agyn/tracing-ui dev
```

Env variables (dev preview only):
- `VITE_TRACING_SERVER_URL` (default `http://localhost:4319`)

## Pages
- `/` traces list (derived from spans)
- `/trace/:traceId` trace explorer
  - Left: span tree (30%)
  - Right: timeline or selected span details

## Navigation
- The top navigation appears on entry routes and lets you switch between Traces and Error tools.
  - Displayed on: `/`, `/errors/tools`, `/errors/tools/:label`.
  - Not displayed on: `/trace/:traceId`, `/thread/:threadId` (detail views).
- Error tools link preserves the current `?from` and `?to` query params when navigating within `/errors/tools*`.
  - Example: while at `/errors/tools?from=...&to=...`, clicking "Error tools" keeps the range.
  - When switching to `/` (Traces), the time range params are not propagated.

## Future Enhancements
- Server-side trace aggregation endpoint
- Live updates via polling / SSE
- Search & filters
- Dark mode
Provider and styles
- Provider is required: <TracingProvider serverUrl="..." />
- Styles: import '@agyn/tracing-ui/styles.css' to get .tracing-md and .tracing-terminal class rules.
