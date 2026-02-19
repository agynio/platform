import { EntityListPage } from './entities/EntityListPage';
import { EXCLUDED_WORKSPACE_TEMPLATES } from '@/features/entities/api/graphEntities';

export function WorkspacesListPage() {
  return (
    <EntityListPage
      kind="workspace"
      title="Workspaces"
      description="Manage underlying services and workspaces powering agents."
      listPath="/workspaces"
      createLabel="New workspace"
      emptyLabel="No workspaces configured yet."
      templateExcludeNames={EXCLUDED_WORKSPACE_TEMPLATES}
    />
  );
}
