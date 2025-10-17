# Graph Node Status Updates

Transport: socket.io

- Socket: default namespace (no custom path)
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
- Connect to the default namespace and subscribe to `node_status`.
- Server emits `node_status` for relevant changes: pause/resume, provision status updates, dynamic-config readiness.
- Initial render can still use HTTP GET /graph/nodes/:nodeId/status; subsequent updates should come via socket.io push.

Example (client)

const socket = io();
socket.on('connect', () => {
  console.log('connected to default namespace');
  // Optionally subscribe to a room per graph or node
});

socket.on('node_status', (payload) => {
  // { nodeId, isPaused?, provisionStatus?, dynamicConfigReady?, updatedAt }
  updateUI(payload);
});

Notes
- HTTP endpoints remain for actions (pause/resume, provision/deprovision) and configuration updates.
- Remove any polling loops (e.g., 2s intervals) for status; rely on socket events.

Config persistence
- Graph configuration changes persist via POST /api/graph (full-graph updates).
- The per-node dynamic-config save endpoint was removed; only the schema endpoint remains for rendering purposes.

## Template Capabilities & Static Config (Updated)

Each template now advertises its capabilities and optional static configuration schema via the `/api/templates` and `/graph/templates` endpoints. UI palette entries can introspect:

- `capabilities.pausable`: Node supports pause/resume (triggers, agents).
- `capabilities.provisionable`: Node exposes provision/deprovision lifecycle (Slack trigger, MCP server).
- `capabilities.staticConfigurable`: Node accepts an initial static config that is applied through `setConfig` (agent, container provider, call_agent tool, MCP server).
- `capabilities.dynamicConfigurable`: Node exposes a dynamic runtime config surface (MCP server tool enable/disable) once `dynamicConfigReady` is true.

Static config schemas (all templates now expose one – some are currently empty placeholders to allow forward-compatible UI forms):
- `simpleAgent`: title, systemPrompt, summarization options.
- `containerProvider`: image, env map.
- `callAgentTool`: description, name override.
- `mcpServer`: namespace, command, workdir, timeouts, restart strategy.
- `shellTool`: (empty object for now).
- `githubCloneRepoTool`: (empty object for now).
- `sendSlackMessageTool`: (empty object for now).
- `slackTrigger`: debounceMs, waitForBusy (note: presently setConfig is a no-op; values must be supplied at creation time until runtime reconfiguration is implemented).

Dynamic config (currently only MCP server) becomes available after initial tool discovery; UI should check `dynamicConfigReady` before rendering its form.
