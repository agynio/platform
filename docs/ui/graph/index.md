# Graph UI Builder

Data flow
- TemplatesProvider loads templates from `/graph/templates` (alias of `/api/templates`). Components consume capabilities to render controls.
- Initial node status fetched via `GET /graph/nodes/:id/status`.
- Realtime updates: listen to Socket.IO on the default namespace for `node_status` events. Do not poll when sockets are available.
- For dynamic-configurable nodes (e.g., MCP server), fetch JSON Schema via `GET /graph/nodes/:id/dynamic-config/schema` and render a dynamic form when `dynamicConfigReady` is true.
- Refer to docs/graph/status-updates.md for event shapes and sequencing.

Configuration
- Required environment variables:
  - VITE_API_BASE_URL: Agents API base URL (use the REST origin — `http://localhost:3010` locally; the UI appends `/api` for HTTP calls)
  - VITE_SOCKET_BASE_URL: Socket.IO base URL (use the notifications service origin — `http://localhost:4000` locally; the client connects to `/socket.io` with websocket transport only)
- Tracing configuration has been removed; span data is no longer rendered in the builder sidebar.

Related docs
- docs/ui/config-views.md (custom config view registry)
- docs/graph/status-updates.md (status event reference)

Related concepts
- Templates provider, HTTP helpers, socket wiring, and graph panels/widgets are part of the UI implementation.
