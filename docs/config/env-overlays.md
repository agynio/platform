# Per-node environment overlays (Shell and MCP)

Overview
- Base environment comes from the workspace container. Node-level overlays apply only to that node’s execs.
- No server-side interpolation of values; use shell expansion if needed.
- Values are not logged.

Shell tool
- Static config fields:
  - `env?: Record<string,string>` — key/value pairs to set for this tool’s execs.
  - `workdir?: string` — working directory for each exec.
- Behavior:
  - Pass `env` and `workdir` to container.exec options (per exec only).
  - Empty string sets a variable to empty (does not unset).

MCP server
- Static config fields:
  - `env?: Record<string,string>` — per-exec overlay for discovery and tool calls.
  - `unset?: string[]` — names to unset before starting MCP in the shell.
  - `workdir?: string` — working directory for MCP execs.
- Behavior:
  - During discovery and each tool call, pass Env as `K=V` array, preserve workdir.
  - Overlays are not persisted across calls; every exec is isolated.

Examples
```json
// Shell node
{
  "env": { "NODE_ENV": "production", "FOO": "bar" },
  "workdir": "/workspace/app"
}

// MCP node
{
  "namespace": "crm",
  "command": "mcp start --stdio",
  "env": { "CRM_API_URL": "https://api.example.com", "CRM_TOKEN": "${CRM_TOKEN}" },
  "workdir": "/workspace/services/crm"
}
```

Security notes
- Prefer Vault or reference-based secrets for values; avoid hardcoding secrets in graphs.
- Avoid including env maps/values in prompts or logs.
