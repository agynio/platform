import { EntityListPage } from './entities/EntityListPage';

export function ToolsListPage() {
  return (
    <EntityListPage
      kind="tool"
      title="Tools"
      description="Browse available tools, including MCP connections."
      createLabel="New tool"
      emptyLabel="No tools available."
    />
  );
}
