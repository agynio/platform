# Graph Node Status Updates

Transport: socket.io

- Namespace: /graph
- Event: node_status
- Payload:
  {
    nodeId: string,
    isPaused?: boolean,
    provisionStatus?: { state: string; [k: string]: unknown },
    dynamicConfigReady?: boolean,
    updatedAt: string
  }

Client guidance
- Connect to the /graph namespace and subscribe to `node_status`.
- Server emits `node_status` for relevant changes: pause/resume, provision status updates, dynamic-config readiness.
- Initial render can still use HTTP GET /graph/nodes/:nodeId/status; subsequent updates should come via socket.io push.

Example (client)

const socket = io('/graph');
socket.on('connect', () => {
  console.log('connected to graph namespace');
  // Optionally subscribe to a room per graph or node
});

socket.on('node_status', (payload) => {
  // { nodeId, isPaused?, provisionStatus?, dynamicConfigReady?, updatedAt }
  updateUI(payload);
});

Notes
- HTTP endpoints remain for actions (pause/resume, provision/deprovision) and configuration updates.
- Remove any polling loops (e.g., 2s intervals) for status; rely on socket events.
