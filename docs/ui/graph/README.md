# Graph UI: Overview

This UI targets a single-graph runtime with REST endpoints under the /graph prefix and live updates over socket.io.

Key ideas
- Single-graph model: node-level endpoints are scoped as /graph/nodes/:nodeId
- Capabilities drive UI controls:
  - provisionable → Start/Stop buttons
  - pausable → Pause/Resume toggle
  - staticConfigurable → custom static ConfigView rendered from registry
  - dynamicConfigurable → custom dynamic ConfigView rendered from registry
- Live status via socket.io; no polling

Endpoints (reference)
- GET /graph/templates
- GET /graph/nodes/:nodeId/status
- POST /graph/nodes/:nodeId/actions  body: { action: 'provision' | 'deprovision' | 'pause' | 'resume' }
- POST /graph/nodes/:nodeId/config       body: Record<string, unknown>
- GET /graph/nodes/:nodeId/dynamic-config-schema
- POST /graph/nodes/:nodeId/dynamic-config body: Record<string, unknown>

Socket updates
- Namespace: /graph
- Event: node_status
- Payload: { nodeId, isPaused?, provisionStatus?, dynamicConfigReady?, updatedAt? }
- The UI subscribes per-node and reconciles socket events into React Query cache.
