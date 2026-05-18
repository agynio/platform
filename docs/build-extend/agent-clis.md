---
title: Agent CLIs
description: Choose Codex, Claude Code, or agn — or write your own agent loop.
order: 5
---

# Agent CLIs

The agent CLI is the program that drives the actual LLM reasoning inside an agent workload — making LLM calls, choosing tools, processing responses, posting back to the conversation. Agyn is CLI-agnostic: it wraps any agent loop in `agynd` (the platform daemon) and hides the platform plumbing.

You pick a CLI by choosing the init image when you create an agent.

## Built-in CLIs

| CLI | Init image | What it is |
|---|---|---|
| **Codex** | `ghcr.io/agynio/agent-init-codex:<version>` | [OpenAI Codex CLI](https://github.com/openai/codex). Good general-purpose engineering agent loop. |
| **Claude Code** | `ghcr.io/agynio/agent-init-claude:<version>` | [Anthropic Claude Code](https://docs.claude.com/en/docs/claude-code/overview). Strong at long-running engineering tasks. |
| **agn** | `ghcr.io/agynio/agent-init-agn:<version>` | Agyn's native agent loop. Reference implementation; minimal, easy to extend. |

Each init image bundles `agynd`, the `agyn` CLI, the agent CLI binary, and a small startup script. At workload boot, the init container copies these binaries into a shared volume mounted at `/agyn-bin`; the runtime container has them on its PATH.

## How to choose

| If you want… | Pick |
|---|---|
| The most-tested off-the-shelf agent loop today | **Codex** |
| First-class tool use and a tight loop suited to long engineering tasks | **Claude Code** |
| To understand or modify the agent loop yourself | **agn** |
| To use your own custom CLI | Build a custom init image (see below) |

## Switching CLIs

Switching is a configuration change on the agent — replace the init image and (typically) the model. The agent's MCPs, secrets, volumes, and hooks transfer across CLIs because they are managed by the platform, not the CLI.

In the Console (Administer → Agents → edit) or Terraform:

```hcl
resource "agyn_agent" "support" {
  # ...
  init_image = "ghcr.io/agynio/agent-init-claude:v1.0.0"
  model      = agyn_llm_model.sonnet_4_6.name
}
```

## How a workload runs

The pod layout for any CLI:

```
Pod
├── init container (init image)         # copies binaries to /agyn-bin
├── runtime container (your dev image)  # runs agynd, which runs the CLI
├── files-mcp sidecar (if attached)     # tool sidecar
├── your other MCP sidecars             # one per MCP
├── hooks sidecars (if any)             # one per hook
└── Ziti sidecar                        # private network access
```

Inside the runtime container:

1. `/agyn-bin/agynd` is the entrypoint.
2. `agynd` fetches agent configuration from Gateway (skills → `/skills/*.md`, MCP configs → CLI's MCP config file, init scripts → executed in order).
3. `agynd` exports `OPENAI_API_BASE` / `ANTHROPIC_API_URL` / equivalents to point at `llm-proxy.ziti` so LLM calls route through the platform proxy.
4. `agynd` spawns the agent CLI.
5. The CLI runs its loop. `agynd` posts model output to the thread, acknowledges messages, and sends [keepalives](../administer/agents.md#idle-timeout) while the CLI is producing output.

## Writing a custom CLI

If none of the built-ins fit your use case, you can ship your own. The contract:

- **Binary location.** Place your CLI binary in `/agyn-bin/cli`. `agynd` prepends `/agyn-bin/cli` and `/agyn-bin` to PATH.
- **LLM endpoint.** Honor the LLM endpoint and credentials `agynd` exports as environment variables. By default this means using the `OPENAI_API_BASE` (`responses` protocol) or Anthropic equivalents — adapted clients work without modification.
- **MCP configuration.** Read your MCP server endpoints from the config file `agynd` writes (path provided in an env var). Or use whatever convention the underlying SDK expects — `agynd` writes Codex- and Claude-style configs out of the box.
- **Skills.** Files in `/skills/` are reusable prompt fragments — load them into your system prompt as appropriate for your loop.
- **Threads I/O.** For each user message, your CLI receives it on stdin (or via an `agynd`-provided file) and writes responses to stdout. `agynd` posts both to the conversation.

The simplest path is to fork the `agn-cli` repo and modify it. See [`agynio/agn-cli`](https://github.com/agynio/agn-cli).

### Custom init image

Bundle your CLI by extending the init-image pattern:

```dockerfile
FROM ghcr.io/agynio/agent-init-base:latest

COPY mycli /agyn-bin/cli/mycli
COPY startup.sh /agyn-bin/startup.sh
```

The base image provides `agynd` and the `agyn` CLI. `startup.sh` is a shell script copied to the runtime container that prepares anything CLI-specific (mostly: which CLI binary `agynd` should spawn).

Push the image, then set it as `init_image` on an agent.

## Hooks across CLIs

[Hooks](../administer/hooks.md) are sidecar processes that respond to events emitted by the agent CLI. Each CLI emits a slightly different event set; consult the CLI's documentation for the canonical list. `agynd` translates platform events into hook invocations.

## agynd

For the full daemon spec (every env var, every file it writes, every API call it makes), see [agynd](./agynd.md).

## Related

- [Administer → Agents](../administer/agents.md) — pick a CLI when creating an agent.
- [agynd](./agynd.md) — the wrapper daemon.
- [MCP servers](./mcp-servers.md) — tools your CLI's agent loop will call.
- [Gateway API](./gateway-api.md) — what `agynd` calls under the hood.
