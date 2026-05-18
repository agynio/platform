---
title: Sandboxes
description: Understand how Agyn isolates agent execution.
order: 2
---

# Sandboxes

A sandbox is the isolated runtime where an agent performs work.

It gives each agent a controlled filesystem, process space, and environment.

## Why sandboxes matter

- Secrets stay outside the model context unless explicitly exposed through tools.
- Runtime dependencies are packaged and versioned with the sandbox image.
- Idle agents can be terminated without losing platform-level configuration.
- Operations teams can reason about resource usage per agent.

See [Configuration](../reference/configuration.md) for common sandbox settings.
