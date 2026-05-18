---
title: Tools and MCPs
description: Learn how agents connect to external systems.
order: 3
---

# Tools and MCPs

Agents use tools to read data, take actions, and work with company systems.

Agyn connects those tools through MCP servers that run separately from the agent.

## Tooling model

- Each MCP server can be configured and audited independently.
- Agents receive only the tools assigned to their deployment.
- Tool isolation reduces the blast radius of a single integration.
- Teams can standardize approved tool bundles over time.

For a practical workflow, see [Connect tools](../guides/connect-tools.md).
