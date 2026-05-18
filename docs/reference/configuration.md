---
title: Configuration
description: Common configuration fields for Agyn agents.
order: 1
---

# Configuration

Agent configuration defines how the platform runs and governs an agent.

Keep configuration small at first and expand it as the agent proves useful.

## Common fields

- `name` identifies the agent for users and operators.
- `model` selects the model provider and model name.
- `sandbox_image` defines the runtime image.
- `idle_timeout` controls when inactive runtimes stop.
- `mcp` lists the MCP integrations attached to the agent.

See [Terraform](./terraform.md) for an example resource shape.
