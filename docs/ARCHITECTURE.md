# Architecture: Unified Node Model

Everything is a Node. The server manages all runtime components through a single lifecycle interface. This section defines what “everything” means, how constructors behave, and how to name and place files.

## Everything lives under nodes/

- Location: `apps/server/src/nodes/`
- Components that are Nodes:
  - Tools
  - Triggers
  - Workspace provider(s)
  - MCP servers (local and remote adapters)
  - Memory and vector stores
  - Agents

Each of these implements the Node lifecycle described in docs/LIFECYCLE.md.

## DI-only constructors

- Constructors must be pure DI wiring: capture dependencies and cheap config, but perform no side effects.
- No network calls, no file I/O, no process spawning, and no registration in constructors.
- All activation happens in `start()`; all teardown happens in `stop()`; durable removal happens in `delete()`.

## Agent-as-Node

- Agent conforms to the Node lifecycle: `configure()`, `start()`, `stop()`, `delete()`.
- No constructor self-init; all setup/compilation happens in `start()`.
- Preserve existing scheduling and buffering behavior; these are internal agent concerns and remain intact.
- The orchestrator treats Agent like any other Node with identical call semantics.

## Naming and Layout Conventions

- File names: kebab-case.
- Suffix: `*.node.ts` for all nodes.
- Directory: simple nodes are single files under `apps/server/src/nodes/`.
- Complex nodes: use a subfolder with an `index.ts` that exports the Node.
  - Example: `apps/server/src/nodes/mcp/local/index.ts` exporting `local-mcp-server.node.ts` internals.
- Keep non-node helpers adjacent when appropriate, but avoid side effects at module top-level.

## Imports and Exports

- Nodes export a concrete implementation that satisfies the `Node` interface.
- Barrel files are optional; during migration, temporary barrels may exist but should not introduce alternate lifecycles.

For lifecycle semantics and allowed operations per state, see docs/LIFECYCLE.md.

