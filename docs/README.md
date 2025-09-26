# Agents Documentation

- Technical Overview: [technical-overview.md](technical-overview.md)
- Contributing: [contributing/index.md](contributing/index.md)
- Style Guides: [contributing/style_guides.md](contributing/style_guides.md)
- MCP Design: [mcp-design.md](mcp-design.md)

## Recent Additions

- Container Provider now supports an optional `initialScript` configuration field. When set, the script is executed inside a newly created container immediately after it starts (via `/bin/sh -lc`). A non-zero exit code fails provisioning of that container.
