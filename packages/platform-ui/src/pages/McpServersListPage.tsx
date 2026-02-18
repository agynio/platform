import { EntityListPage } from './entities/EntityListPage';

export function McpServersListPage() {
  return (
    <EntityListPage
      kind="mcp"
      title="MCP Servers"
      description="Configure Model Context Protocol servers that expose MCP tools to your agents."
      createLabel="New MCP server"
      emptyLabel="No MCP servers configured yet."
    />
  );
}
