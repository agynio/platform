# Graph UI: Overview

This UI targets a single-graph runtime with REST endpoints under the /graph prefix and live updates over socket.io.

Key ideas
- Single-graph model: node-level endpoints are scoped as /graph/nodes/:nodeId
- Palette schema exposes kind/ports; UI uses built-in config views for known templates.
- Live status via socket.io; no polling

Endpoints (reference)
- GET /graph/templates
- GET /graph/nodes/:nodeId/status
- POST /graph/nodes/:nodeId/actions  body: { action: 'provision' | 'deprovision' }
- POST /graph/nodes/:nodeId/discover-tools

Socket updates
- Socket: default namespace (no custom path)
- Event: node_status
- Payload: { nodeId, provisionStatus?, updatedAt? }
- The UI subscribes per-node and reconciles socket events into React Query cache.

See also
- docs/ui/graph/index.md for data flow and configuration
- docs/graph/status-updates.md for event details
