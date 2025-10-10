# Per-node environment overlays (Shell and MCP)

Overview
- Base environment comes from the workspace container. Node-level overlays apply only to that node’s execs.
- No server-side interpolation of values; use shell expansion if needed.
- Values are not logged.

Shell tool
- Static config fields:
  - `env?: Record<string,string>` — key/value pairs to set for this tool’s execs.
  - `unset?: string[]` — variable names to unset before running the command; names must match `/^[A-Za-z_][A-Za-z0-9_]*$/`.
  - `workdir?: string` — working directory for each exec.
- Behavior:
  - Build `unset V1 V2 …; <command>` and pass to the shell.
  - Pass `env` and `workdir` to container.exec options (per exec only).
  - Empty string sets a variable to empty (does not unset).

MCP server
- Static config fields:
  - `env?: Record<string,string>` — per-exec overlay for discovery and tool calls.
  - `unset?: string[]` — names to unset before starting MCP in the shell.
  - `workdir?: string` — working directory for MCP execs.
- Behavior:
  - During discovery and each tool call, prefix `unset …;` and pass Env as `K=V` array, preserve workdir.
  - Overlays are not persisted across calls; every exec is isolated.

Examples
```json
// Shell node
{
  "env": { "NODE_ENV": "production", "FOO": "bar" },
  "unset": ["AWS_SECRET_ACCESS_KEY", "OLD_TOKEN"],
  "workdir": "/workspace/app"
}

// MCP node
{
  "namespace": "crm",
  "command": "mcp start --stdio",
  "env": { "CRM_API_URL": "https://api.example.com", "CRM_TOKEN": "${CRM_TOKEN}" },
  "unset": ["DEBUG"],
  "workdir": "/workspace/services/crm"
}
```

Security notes
- Prefer Vault or reference-based secrets for values; avoid hardcoding secrets in graphs.
- Unset is useful to prevent sensitive base env vars from reaching a child process.
- Avoid including env maps/values in prompts or logs.

