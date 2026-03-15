# Graph Node Status Updates

Transport: socket.io

- Socket: default namespace (no custom path)
- Event: node_status
- Payload:
  {
    nodeId: string,
    provisionStatus?: { state: string; [k: string]: unknown },
    updatedAt?: string
  }

Client guidance
- Connect to the default namespace and subscribe to `node_status`.
- Server emits `node_status` for provision status changes.
- Initial render can still use HTTP GET /graph/nodes/:nodeId/status; subsequent updates should come via socket.io push.

Example (client)

const socket = io();
socket.on('connect', () => {
  console.log('connected to default namespace');
  // Optionally subscribe to a room per graph or node
});

socket.on('node_status', (payload) => {
  // { nodeId, provisionStatus?, updatedAt }
  updateUI(payload);
});

Notes
- HTTP endpoints remain for actions (provision/deprovision).
- Remove any polling loops (e.g., 2s intervals) for status; rely on socket events.

Graph source and persistence
- Graph configuration is sourced from the Teams service; `/api/graph` is GET-only and returns the latest snapshot.
- UI edits to layout are local-only; the backend does not accept full-graph writes.
- Node state is not persisted; node status reflects runtime provisioning only.
- Graph variables are managed via the Teams service and exposed via `/api/graph/variables`.
- MCP tool lists refresh via `POST /api/graph/nodes/:nodeId/discover-tools`.

## Template Schema (Updated)

The `/api/templates` and `/graph/templates` endpoints return the palette schema:

- `name`, `title`, `kind`
- `sourcePorts`, `targetPorts`

Capability flags and config schemas are not included in the palette response.

Wiring timing and run state visibility
- During server bootstrap, globalThis.liveGraphRuntime and globalThis.__agentRunsService must be assigned before applying any persisted graph to the runtime.
- Reason: agent factories created by runtime.apply() may read these globals during init() to wire run persistence and termination hooks. If set too late, the UI Activity tab may not see active runs and the Terminate button can be hidden.
- The server now sets these globals before runtime.apply(); no UI changes are required. If Terminate is hidden, verify the agent node shows at least one run with status 'running' or 'terminating' via GET /graph/nodes/:nodeId/runs.
