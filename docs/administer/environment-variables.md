---
title: Environment variables
description: Pass plain values and secrets to agents, MCP servers, and hooks.
order: 10
---

# Environment variables

Environment variables are how the agent runtime, MCP sidecars, and hooks receive configuration. Two kinds are supported:

- **Plain values** — string literals stored on the resource.
- **Secret references** — values resolved at workload start from a [secret](./secrets.md).

The orchestrator injects ENVs into the container at workload assembly time. The container sees standard `KEY=VALUE` pairs in its environment. Secrets are never written to disk and never reach the cluster's API server outside the workload's pod.

## Where ENVs are configured

ENVs belong to an agent, MCP server, or hook — not to the organization. Set them per resource so each container gets only what it needs.

| Resource | Console path |
|---|---|
| Agent | Agents → <agent> → **ENVs** tab |
| MCP server | Agents → <agent> → MCPs → <mcp> → **ENVs** tab |
| Hook | Agents → <agent> → Hooks → <hook> → **ENVs** tab |

## Add a plain ENV

### In the Console

1. Open the resource's **ENVs** tab.
2. Click **Add variable**.
3. Type the **Name** and **Value**.
4. Save.

![Agent ENVs tab](../_assets/console/agents/envs.png)

Plain ENVs are stored in cleartext in the platform database. Do not use them for credentials.

### With Terraform

```hcl
resource "agyn_agent_env" "log_level" {
  agent_id = agyn_agent.support.id
  name     = "LOG_LEVEL"
  value    = "info"
}
```

## Add a secret-backed ENV

### In the Console

1. ENVs tab → **Add variable**.
2. Toggle the value type to **Secret reference**.
3. Pick a secret from the dropdown (lists secrets in the current organization).
4. Set the **Name** the container will see (e.g. `STRIPE_API_KEY`).
5. Save.

![Secret-backed ENV reference](../_assets/console/agents/envs-secret.png)

The Console shows secret-backed ENVs with a key icon. The resolved value is never displayed — only the secret name and reference.

### With Terraform

```hcl
resource "agyn_agent_env" "stripe_key" {
  agent_id  = agyn_agent.support.id
  name      = "STRIPE_API_KEY"
  secret_id = agyn_secret.stripe_api_key.id
}
```

## Resolution timing

Secret values are resolved when the workload is created — not when the configuration is updated. If you rotate a secret in your [secret provider](./secret-providers.md), the next workload start picks up the new value. Workloads already running continue with the value they were started with until they restart.

For a rotation that needs to take effect immediately, stop the workload (Activity → Workloads → stop) so the orchestrator restarts it on the next message.

## Limits

- ENVs are limited to ~32 KB total per container — Kubernetes' practical limit.
- ENV names follow standard shell rules: uppercase letters, digits, underscores; cannot start with a digit.

## Audit and inspection

ENVs are visible in Console → agent detail. Secret-backed ENVs show only the secret reference. The Tracing app does not display ENV values — it shows the agent's process environment only via redacted markers.

## Related

- [Secrets](./secrets.md)
- [Secret providers](./secret-providers.md)
- [Agents](./agents.md)
- [MCP servers](./mcp-servers.md)
- [Hooks](./hooks.md)
