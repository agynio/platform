# Glossary

- Agent: A configured graph node or composition that performs tasks via tools and models.
- Apply: The operation that updates the live runtime graph from a persisted or proposed diff; serial, idempotent.
- Checkpointer: Persistence component for LangGraph checkpoints (Postgres-backed).
- Container Provider: Component that provisions and manages workspace containers for tools and MCP servers.
- Dynamic Config: Runtime configuration surface exposed by certain nodes (e.g., MCP server tool enable/disable) once discovery is ready.
- Edge: A directed connection between node ports; IDs are deterministic in git store.
- MCP: Model Context Protocol; a server that exposes tools discovered and invoked by the platform.
- Memory Connector: Node or tool that reads/writes memory state; can be placed as a connector or via unified tool.
- PortsRegistry: Registry that defines known ports and supports reversible edge updates.
- Provisionable: Capability indicating a node can be started/stopped (provision/deprovision) at runtime.
- TemplateRegistry: Registry of node templates with schemas, ports, and capabilities.
- TTL: Time-to-live for container reuse; expired workspaces are cleaned up by the cleanup service.
