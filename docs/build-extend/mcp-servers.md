---
title: MCP servers
description: Write your own Model Context Protocol server to give agents new tools.
order: 3
---

# MCP servers

An MCP server exposes one or more tools that agents can call. Tools are typed (JSON Schema for inputs and outputs) and can do anything — query a database, hit an API, execute code, render an image. The platform attaches MCP servers as sidecars to the agent pod so the agent can call them over localhost.

For the admin-facing view (attaching MCPs to agents), see [Administer → MCP servers](../administer/mcp-servers.md). This page is for people writing the MCP server itself.

## Pick a transport

[Model Context Protocol](https://modelcontextprotocol.io) supports two transports:

| Transport | When to use |
|---|---|
| **Streamable HTTP** | Most servers should use this. Standard, easy to deploy as a sidecar, supports concurrent calls. |
| **stdio** | Existing CLI tools you want to wrap quickly. Agyn supports stdio MCPs via an in-pod stdio→HTTP adapter sidecar. |

Both work the same from the agent's perspective.

## Minimal example (TypeScript)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

const server = new McpServer({
  name: "weather-mcp",
  version: "0.1.0",
});

server.tool(
  "get_weather",
  {
    description: "Get the current weather for a city.",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
  async ({ city }) => {
    const data = await fetch(`https://api.weather.example/?city=${city}`).then((r) => r.json());
    return {
      content: [{ type: "text", text: `It is ${data.temperature}°C in ${city}.` }],
    };
  },
);

await server.connect(new StdioServerTransport());
```

Build the package into a container image (the entrypoint runs the MCP server), then attach it to an agent in the Console or Terraform as described in [Administer → MCP servers](../administer/mcp-servers.md).

For a Streamable HTTP server, swap `StdioServerTransport` for `StreamableHttpServerTransport` listening on a port.

## How the agent sees your MCP

On agent workload startup, `agynd`:

1. Reads the agent's MCP list from the Agents service.
2. Builds an MCP client configuration pointing at each MCP's sidecar.
3. Starts the agent CLI with that configuration.

The agent CLI then performs MCP's standard `initialize` and `tools/list` handshake. Each tool name is namespaced under the MCP name. For example, an MCP named `weather` exposing `get_weather` shows up to the model as `weather/get_weather` (exact naming depends on the agent CLI).

## What runs in your container

Your container runs once per agent workload — it starts when the workload starts and stops when the workload stops. Across runs in the same conversation, the workload restarts and your container restarts with it.

The MCP server is **stateless from the platform's perspective**. If your server needs persistence (a cache, a session, a database file), use a [volume](../administer/volumes.md) attached to the MCP — see [Administer → Volumes](../administer/volumes.md#attach-a-volume).

## Credentials

Pass credentials as environment variables on the MCP, ideally backed by [secrets](../administer/secrets.md). Do not hard-code values into the image.

```hcl
resource "agyn_agent_mcp" "weather" {
  agent_id = agyn_agent.support.id
  name     = "weather"
  image    = "ghcr.io/acme/weather-mcp:latest"

  envs = [
    {
      name      = "WEATHER_API_KEY"
      secret_id = agyn_secret.weather_api_key.id
    },
  ]
}
```

## Calling the platform from your MCP

If your MCP needs to call platform services (e.g. it wants to act as the agent on the user's behalf), use the agent's OpenZiti-injected identity. The agent pod has Ziti hostnames available:

- `gateway.ziti` — Gateway API.
- `llm-proxy.ziti` — LLM Proxy.

Your MCP container does not need explicit credentials for these — the Ziti sidecar handles mTLS. See [files-mcp](./files-mcp.md) for a working example.

## Stream long-running tool output

Tools can return:

- A single result (text, JSON, image bytes, etc.) when they finish.
- Streaming output via MCP's `progress` notifications.

For long-running tools (a build, a database query), use progress notifications so users see incremental output in the [Run Timeline](../use/run-timeline.md).

## Tool annotations

Use MCP's annotations to give the agent CLI hints:

- `readOnly` — tool does not mutate state.
- `destructive` — tool deletes or overwrites data.
- `idempotent` — calling twice has the same effect as once.

Some agent CLIs use these hints to decide whether to ask the user for confirmation before calling a tool.

## Testing locally

Run your MCP server against an MCP client (the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) or your agent CLI in dev mode). Validate that:

- `tools/list` returns the expected tools.
- Each tool's input schema matches what the agent will pass.
- Output content fits one of MCP's content types (text, image, audio, embedded resource).

## Publish

There is no "marketplace" for MCP servers in Agyn itself — admins attach MCPs by image. To distribute your MCP:

- Publish the container image to a registry (GHCR, Docker Hub, ECR).
- Document its inputs/outputs (the `inputSchema` your tools declare).
- Document its environment variables and any required secrets.

Admins reference the image in their agent configuration as described in [Administer → MCP servers](../administer/mcp-servers.md).

## Related

- [Administer → MCP servers](../administer/mcp-servers.md) — attaching MCPs to agents.
- [files-mcp](./files-mcp.md) — reference implementation.
- [Model Context Protocol spec](https://modelcontextprotocol.io).
