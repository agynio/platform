# Agents Documentation

- Technical Overview: [technical-overview.md](technical-overview.md)
- Contributing: [contributing/index.md](contributing/index.md)
- Style Guides: [contributing/style_guides.md](contributing/style_guides.md)
- MCP Design: [mcp-design.md](mcp-design.md)

## Recent Additions

- Workspace (containerProvider) now supports an optional `platform` config field (e.g., `linux/amd64`, `linux/arm64`). When set, the platform is passed to image pull and container creation; existing containers with a different platform are not reused. See workspace-platform.md for details.
- Container Provider still supports `initialScript` to run a shell script after container creation (non-zero exit fails provisioning).
- Simple Agent now accepts a `model` static configuration parameter to select the underlying LLM (default: `gpt-5`). You can override it per agent instance via the graph static config UI or API.
