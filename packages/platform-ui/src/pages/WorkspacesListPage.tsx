import { EntityListPage } from './entities/EntityListPage';

export function WorkspacesListPage() {
  return (
    <EntityListPage
      kind="workspace"
      title="Workspaces"
      description="Manage underlying services and workspaces powering agents."
      createLabel="New workspace"
      emptyLabel="No workspaces configured yet."
    />
  );
}
