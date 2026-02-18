import { EntityListPage } from './entities/EntityListPage';

export function ToolsListPage() {
  return (
    <EntityListPage
      kind="tool"
      title="Tools"
      description="Browse available tools provided by agents and services."
      createLabel="New tool"
      emptyLabel="No tools available."
    />
  );
}
