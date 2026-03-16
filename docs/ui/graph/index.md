# Graph UI Builder

Data flow
- TemplatesProvider loads templates from `/graph/templates` (alias of `/api/templates`). Components use kind/ports metadata (capability flags are not included).
- Initial node status fetched via `GET /graph/nodes/:id/status`.
- Realtime updates: listen to Socket.IO on the default namespace for `node_status` events. Do not poll when sockets are available.
- For MCP server nodes, refresh tool lists via `POST /graph/nodes/:id/discover-tools` and use the response to update tool selection UI.
- Refer to docs/graph/status-updates.md for event shapes and sequencing.

Configuration
- Required environment variables:
  - VITE_API_BASE_URL: Agents API base URL (use the origin only; the UI appends `/api` for REST calls and `/socket.io` for websockets)
- Tracing configuration has been removed; span data is no longer rendered in the builder sidebar.

Related docs
- docs/ui/config-views.md (custom config view registry)
- docs/graph/status-updates.md (status event reference)

Related concepts
- Templates provider, HTTP helpers, socket wiring, and graph panels/widgets are part of the UI implementation.
