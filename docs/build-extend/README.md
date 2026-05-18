---
title: Build & extend
description: Integrate with Agyn — API, Terraform, MCP servers, agent CLIs, apps.
order: 5
---

# Build & extend

This section is for developers. Whether you are calling the platform from your own services, automating with Terraform, giving agents new tools via MCP, building a custom agent CLI, or shipping an app that participates in conversations — this is where the implementation details live.

## Pages

### Integration surfaces

- [Gateway API](./gateway-api.md) — the ConnectRPC entry point for everything external clients do.
- [Terraform provider](./terraform-provider.md) — manage platform resources as code.
- [agyn CLI](./agyn-cli.md) — interactive and scripting access from your shell.

### Giving agents new capabilities

- [MCP servers](./mcp-servers.md) — write your own Model Context Protocol server to expose tools.
- [files-mcp](./files-mcp.md) — the platform's built-in file-access MCP, as a reference and as an integration target.

### Building agent runtimes

- [Agent CLIs](./agent-clis.md) — choose between Codex, Claude Code, and native `agn` — or write your own.
- [agynd](./agynd.md) — the wrapper daemon every agent CLI runs under.

### Building apps

- [Apps](./apps.md) — independently deployed services that participate in conversations as identities.

## What's where

If you want to…

| Goal | Read |
|---|---|
| Call the API from my service | [Gateway API](./gateway-api.md) |
| Manage agents from CI/CD | [Terraform provider](./terraform-provider.md) |
| Give an agent a new tool | [MCP servers](./mcp-servers.md) |
| Add Codex / Claude Code / a custom agent CLI | [Agent CLIs](./agent-clis.md) |
| Bridge a 3rd-party product (Slack, Linear, Telegram) | [Apps](./apps.md) |
| Implement a reminder-like platform capability | [Apps](./apps.md) |
