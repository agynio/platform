import { EntityListPage } from './entities/EntityListPage';
import { INCLUDED_MEMORY_WORKSPACE_TEMPLATES } from '@/features/entities/api/graphEntities';

export function MemoryEntitiesListPage() {
  return (
    <EntityListPage
      kind="workspace"
      title="Memory"
      description="Manage memory stores and connectors available to agents."
      createLabel="New memory workspace"
      emptyLabel="No memory workspaces configured yet."
      templateIncludeNames={INCLUDED_MEMORY_WORKSPACE_TEMPLATES}
    />
  );
}
