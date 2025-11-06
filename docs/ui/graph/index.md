# Graph UI Builder

Data flow
- TemplatesProvider loads templates from `/graph/templates` (alias of `/api/templates`). Components consume capabilities to render controls.
- Initial node status fetched via `GET /graph/nodes/:id/status`.
- Realtime updates: listen to Socket.IO on the default namespace for `node_status` events. Do not poll when sockets are available.
- For dynamic-configurable nodes (e.g., MCP server), fetch JSON Schema via `GET /graph/nodes/:id/dynamic-config/schema` and render a dynamic form when `dynamicConfigReady` is true.
- Refer to docs/graph/status-updates.md for event shapes and sequencing.

Configuration
- API base URL precedence:
  1) VITE_API_BASE_URL
  2) API_BASE_URL (Node env)
  3) VITEST: '' (tests use relative URLs)
  4) default http://localhost:3010
- Observability deep links: set `VITE_TRACING_UI_BASE` (default http://localhost:4320) to enable trace links.

Related docs
- docs/ui/config-views.md (custom config view registry)
- docs/graph/status-updates.md (status event reference)

Related concepts
- Templates provider, HTTP helpers, socket wiring, and graph panels/widgets are part of the UI implementation.
